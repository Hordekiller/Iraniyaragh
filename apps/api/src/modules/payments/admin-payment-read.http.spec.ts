import 'reflect-metadata';

import { Module, ValidationPipe, VersioningType } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { NestFactory, type INestApplication } from '@nestjs/core';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiFoundationModule } from '../../common/api-foundation.module';
import { AuditLogService } from '../audit/audit-log.service';
import { AuthGuard } from '../auth/auth.guard';
import { AuthPrincipalService, type AuthPrincipalContext } from '../auth/auth-principal.service';
import { AuthSessionException } from '../auth/auth-session.service';
import { AdminPaymentReadController } from './admin-payment-read.controller';
import { AdminPaymentReadService } from './admin-payment-read.service';

const base = {
  sessionId: 'session-payment-read', tokenId: 'token-payment-read',
  authenticatedAt: new Date(Date.now() - 30_000),
  accessExpiresAt: new Date(Date.now() + 600_000),
};
const principal = (level: 'CUSTOMER_OTP' | 'STAFF_MFA', permissions: string[]): AuthPrincipalContext => ({
  ...base, userId: level, authenticationLevel: level, permissions: new Set(permissions),
});
const principals = {
  customer: principal('CUSTOMER_OTP', ['payments.read']),
  staff: principal('STAFF_MFA', ['payments.read']),
  unprivileged: principal('STAFF_MFA', ['orders.read']),
};
const principalService = {
  resolveBearerToken: vi.fn(async (authorization?: string) => {
    const token = authorization?.replace('Bearer ', '') as keyof typeof principals;
    if (token in principals) return principals[token];
    throw new AuthSessionException('AUTH_SESSION_INVALID');
  }),
};
const service = {
  list: vi.fn(async () => ({ data: { items: [], meta: { page: 1, perPage: 25, total: 0, pages: 0 } } })),
  get: vi.fn(async (id: string) => ({ data: { payment: { id } } })),
};

@Module({
  imports: [ApiFoundationModule],
  controllers: [AdminPaymentReadController],
  providers: [
    { provide: AdminPaymentReadService, useValue: service },
    { provide: AuthPrincipalService, useValue: principalService },
    { provide: APP_GUARD, useValue: new AuthGuard(
      principalService as unknown as AuthPrincipalService,
      { record: vi.fn(async () => undefined) } as unknown as AuditLogService,
    ) },
  ],
})
class TestModule {}

describe('AdminPaymentReadController HTTP', () => {
  let app: INestApplication;
  let baseUrl: string;
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

  const request = (baseUrl: string, path: string, token?: string) => fetch(baseUrl + path, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });

  it('requires staff MFA and payments.read for list and detail', async () => {
    for (const path of ['/api/v1/payments/admin', '/api/v1/payments/admin/payment-1']) {
      expect((await request(baseUrl, path)).status).toBe(401);
      expect((await request(baseUrl, path, 'customer')).status).toBe(403);
      expect((await request(baseUrl, path, 'unprivileged')).status).toBe(403);
      expect((await request(baseUrl, path, 'staff')).status).toBe(200);
    }
    expect(service.get).toHaveBeenCalledWith('payment-1');
  });

  it('rejects unknown or unbounded filters before querying', async () => {
    expect((await request(baseUrl, '/api/v1/payments/admin?perPage=101', 'staff')).status).toBe(400);
    expect((await request(baseUrl, '/api/v1/payments/admin?status=INVALID', 'staff')).status).toBe(400);
    expect((await request(baseUrl, '/api/v1/payments/admin?internal=true', 'staff')).status).toBe(400);
    expect(service.list).not.toHaveBeenCalled();
  });
});
