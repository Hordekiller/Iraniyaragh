import 'reflect-metadata';
import { Module, ValidationPipe, VersioningType } from '@nestjs/common';
import { APP_GUARD, NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiFoundationModule } from '../../common/api-foundation.module';
import { AuthSessionException } from '../auth/auth-session.service';
import { AuthGuard } from '../auth/auth.guard';
import { AuthPrincipalService, type AuthPrincipalContext } from '../auth/auth-principal.service';
import { AuditLogService } from '../audit/audit-log.service';
import { ShipmentReadService } from './shipment-read.service';
import { ShipmentReadController } from './shipment-read.controller';

const base = {
  sessionId: 'shipment-session',
  tokenId: 'shipment-token',
  authenticatedAt: new Date(Date.now() - 30_000),
  accessExpiresAt: new Date(Date.now() + 600_000),
};
const principals: Record<string, AuthPrincipalContext> = {
  customer: { ...base, userId: 'customer-1', authenticationLevel: 'CUSTOMER_OTP', permissions: new Set<string>() },
  reader: { ...base, userId: 'staff-1', authenticationLevel: 'STAFF_MFA', permissions: new Set(['shipments.read']) },
  denied: { ...base, userId: 'staff-2', authenticationLevel: 'STAFF_MFA', permissions: new Set(['orders.read']) },
};
const principalService = {
  resolveBearerToken: vi.fn(async (authorization?: string) => {
    const principal = authorization?.startsWith('Bearer ') ? principals[authorization.slice(7)] : undefined;
    if (!principal) throw new AuthSessionException('AUTH_SESSION_INVALID');
    return principal;
  }),
};
const emptyList = { data: { items: [], meta: { page: 1, perPage: 25, total: 0, pages: 0 } } };
const service = {
  listShipments: vi.fn(async () => emptyList),
  getShipment: vi.fn(async () => ({ data: { shipment: { id: 'shipment-1' } } })),
};

@Module({
  imports: [ApiFoundationModule],
  controllers: [ShipmentReadController],
  providers: [
    { provide: ShipmentReadService, useValue: service },
    { provide: AuthPrincipalService, useValue: principalService },
    {
      provide: APP_GUARD,
      useValue: new AuthGuard(
        principalService as unknown as AuthPrincipalService,
        { record: vi.fn(async () => undefined) } as unknown as AuditLogService,
      ),
    },
  ],
})
class TestModule {}

function request(path: string, tokenName?: string) {
  const headers: Record<string, string> = {};
  if (tokenName) headers.Authorization = `Bearer ${tokenName}`;
  return fetch(`${baseUrl}${path}`, { headers });
}

let baseUrl: string;

describe('Shipment read HTTP authorization', () => {
  let app: Awaited<ReturnType<typeof NestFactory.create>>;
  beforeAll(async () => {
    app = await NestFactory.create(TestModule, { logger: false });
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
  });
  beforeEach(() => vi.clearAllMocks());
  afterAll(async () => app.close());

  it('refuses anonymous, customer and unrelated-permission tokens on the list', async () => {
    const path = '/api/v1/shipments/admin';
    expect((await request(path)).status).toBe(401);
    expect((await request(path, 'customer')).status).toBe(403);
    expect((await request(path, 'denied')).status).toBe(403);
    expect(service.listShipments).not.toHaveBeenCalled();
    const ok = await request(path, 'reader');
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual(emptyList);
    expect(service.listShipments).toHaveBeenCalledTimes(1);
  });

  it('refuses the detail read without shipments.read', async () => {
    const path = '/api/v1/shipments/admin/shipment-1';
    expect((await request(path, 'denied')).status).toBe(403);
    expect(service.getShipment).not.toHaveBeenCalled();
    expect((await request(path, 'reader')).status).toBe(200);
    expect(service.getShipment).toHaveBeenCalledWith('shipment-1');
  });

  it('applies pagination, filters and sort defaults', async () => {
    const res = await request(
      '/api/v1/shipments/admin?page=2&perPage=5&status=SHIPPED&carrier=post&sortBy=orderNumber&sortDir=asc',
      'reader',
    );
    expect(res.status).toBe(200);
    expect(service.listShipments).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 2,
        perPage: 5,
        status: 'SHIPPED',
        carrier: 'post',
        sortBy: 'orderNumber',
        sortDir: 'asc',
      }),
    );
  });

  it('rejects an unknown query key and an out-of-range page with 400', async () => {
    expect((await request('/api/v1/shipments/admin?unexpected=1', 'reader')).status).toBe(400);
    expect((await request('/api/v1/shipments/admin?page=0', 'reader')).status).toBe(400);
    expect((await request('/api/v1/shipments/admin?status=PENDING', 'reader')).status).toBe(400);
  });
});
