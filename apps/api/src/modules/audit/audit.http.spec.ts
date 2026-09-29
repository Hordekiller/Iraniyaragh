import 'reflect-metadata';
import { Module, ValidationPipe, VersioningType } from '@nestjs/common';
import { APP_GUARD, NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiFoundationModule } from '../../common/api-foundation.module';
import { AuthSessionException } from '../auth/auth-session.service';
import { AuthGuard } from '../auth/auth.guard';
import { AuthPrincipalService, type AuthPrincipalContext } from '../auth/auth-principal.service';
import { AuditLogService } from './audit-log.service';
import { AuditController } from './audit.controller';

const base = {
  sessionId: 'audit-session',
  tokenId: 'audit-token',
  authenticatedAt: new Date(Date.now() - 30_000),
  accessExpiresAt: new Date(Date.now() + 600_000),
};
const principals: Record<string, AuthPrincipalContext> = {
  customer: { ...base, userId: 'customer-1', authenticationLevel: 'CUSTOMER_OTP', permissions: new Set<string>() },
  auditor: { ...base, userId: 'staff-1', authenticationLevel: 'STAFF_MFA', permissions: new Set(['audit.read']) },
  denied: { ...base, userId: 'staff-2', authenticationLevel: 'STAFF_MFA', permissions: new Set(['orders.read']) },
};
const principalService = {
  resolveBearerToken: vi.fn(async (authorization?: string) => {
    const principal = authorization?.startsWith('Bearer ') ? principals[authorization.slice(7)] : undefined;
    if (!principal) throw new AuthSessionException('AUTH_SESSION_INVALID');
    return principal;
  }),
};
const service = {
  list: vi.fn(async () => ({ items: [], count: 0 })),
};

@Module({
  imports: [ApiFoundationModule],
  controllers: [AuditController],
  providers: [
    { provide: AuditLogService, useValue: service },
    { provide: AuthPrincipalService, useValue: principalService },
    { provide: APP_GUARD, useValue: new AuthGuard(principalService as unknown as AuthPrincipalService, { record: vi.fn(async () => undefined) } as unknown as AuditLogService) },
  ],
})
class TestModule {}

function request(path: string, tokenName?: string) {
  const headers: Record<string, string> = {};
  if (tokenName) headers.Authorization = `Bearer ${tokenName}`;
  return fetch(`${baseUrl}${path}`, { headers });
}

let baseUrl: string;

describe('Audit HTTP authorization', () => {
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

  it('refuses anonymous and customer tokens and forwards a public-browsable empty list only to auditors', async () => {
    const path = '/api/v1/audit/admin/logs';
    expect((await request(path)).status).toBe(401);
    expect((await request(path, 'customer')).status).toBe(403);
    expect((await request(path, 'denied')).status).toBe(403);
    expect(service.list).not.toHaveBeenCalled();
    const ok = await request(path, 'auditor');
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ items: [], count: 0 });
    expect(service.list).toHaveBeenCalledTimes(1);
  });

  it('forwards offset/limit/date filters to the service', async () => {
    const path = '/api/v1/audit/admin/logs?offset=10&limit=20&entityType=order';
    const res = await request(path, 'auditor');
    expect(res.status).toBe(200);
    expect(service.list).toHaveBeenCalledWith(expect.objectContaining({ offset: 10, limit: 20, entityType: 'order' }));
  });

  it('rejects invalid pagination with 400', async () => {
    const path = '/api/v1/audit/admin/logs?limit=0';
    expect((await request(path, 'auditor')).status).toBe(400);
  });
});