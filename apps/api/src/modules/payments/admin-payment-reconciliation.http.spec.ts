import 'reflect-metadata';

import { Module, VersioningType } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { NestFactory, type INestApplication } from '@nestjs/core';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiFoundationModule } from '../../common/api-foundation.module';
import { AuditLogService } from '../audit/audit-log.service';
import { AuthGuard } from '../auth/auth.guard';
import { AuthPrincipalService, type AuthPrincipalContext } from '../auth/auth-principal.service';
import { AuthSessionException } from '../auth/auth-session.service';
import { AdminPaymentReconciliationController } from './admin-payment-reconciliation.controller';
import { AdminPaymentReconciliationService } from './admin-payment-reconciliation.service';

const principal = (level: 'CUSTOMER_OTP' | 'STAFF_MFA', permissions: string[], ageMs = 30_000): AuthPrincipalContext => ({
  sessionId: 'session', tokenId: 'token', userId: 'user-1',
  authenticatedAt: new Date(Date.now() - ageMs),
  accessExpiresAt: new Date(Date.now() + 600_000),
  authenticationLevel: level,
  permissions: new Set(permissions),
});
const principals = {
  staff: principal('STAFF_MFA', ['payments.reconcile']),
  stale: principal('STAFF_MFA', ['payments.reconcile'], 10 * 60_000),
  reader: principal('STAFF_MFA', ['payments.read']),
  customer: principal('CUSTOMER_OTP', ['payments.reconcile']),
};
const principalService = {
  resolveBearerToken: vi.fn(async (authorization?: string) => {
    const token = authorization?.replace('Bearer ', '') as keyof typeof principals;
    if (token in principals) return principals[token];
    throw new AuthSessionException('AUTH_SESSION_INVALID');
  }),
};
const audit = { record: vi.fn(async () => undefined) };
const service = { recheck: vi.fn(async () => ({ data: { reconciliation: { paymentId: 'payment-1' } } })) };

@Module({
  imports: [ApiFoundationModule], controllers: [AdminPaymentReconciliationController],
  providers: [
    { provide: AdminPaymentReconciliationService, useValue: service },
    { provide: AuthPrincipalService, useValue: principalService },
    { provide: APP_GUARD, useValue: new AuthGuard(
      principalService as unknown as AuthPrincipalService,
      audit as unknown as AuditLogService,
    ) },
  ],
})
class TestModule {}

describe('Admin payment reconciliation HTTP authorization', () => {
  let app: INestApplication;
  let baseUrl: string;
  beforeAll(async () => {
    app = await NestFactory.create(TestModule, { logger: false });
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
  });
  beforeEach(() => vi.clearAllMocks());
  afterAll(async () => app.close());

  const post = (baseUrl: string, token?: string) => fetch(`${baseUrl}/api/v1/payments/admin/payment-1/reconcile`, {
    method: 'POST', headers: token ? { authorization: `Bearer ${token}` } : {},
  });

  it('requires a fresh staff MFA principal with payments.reconcile', async () => {
    expect((await post(baseUrl)).status).toBe(401);
    expect((await post(baseUrl, 'customer')).status).toBe(403);
    expect((await post(baseUrl, 'reader')).status).toBe(403);
    expect((await post(baseUrl, 'stale')).status).toBe(401);
    expect(service.recheck).not.toHaveBeenCalled();
    const response = await post(baseUrl, 'staff');
    expect(response.status).toBe(200);
    expect(service.recheck).toHaveBeenCalledWith(expect.objectContaining({ paymentId: 'payment-1', actorId: 'user-1' }));
  });
});
