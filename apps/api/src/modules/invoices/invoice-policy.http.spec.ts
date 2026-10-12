import 'reflect-metadata';
import { Module, VersioningType } from '@nestjs/common';
import { APP_GUARD, NestFactory, type INestApplication } from '@nestjs/core';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiFoundationModule } from '../../common/api-foundation.module';
import { AuditLogService } from '../audit/audit-log.service';
import { AuthGuard } from '../auth/auth.guard';
import { AuthPrincipalService, type AuthPrincipalContext } from '../auth/auth-principal.service';
import { AuthSessionException } from '../auth/auth-session.service';
import { InvoicePolicyController } from './invoice-policy.controller';
import { InvoicePolicyService } from './invoice-policy.service';

const principal = (level: 'CUSTOMER_OTP' | 'STAFF_MFA', permissions: string[], stale = false): AuthPrincipalContext => ({
  userId: 'operator', sessionId: 'test-session', tokenId: 'test-token', authenticationLevel: level, permissions: new Set(permissions),
  authenticatedAt: new Date(Date.now() - (stale ? 600000 : 1000)), accessExpiresAt: new Date(Date.now() + 600000),
});
const principals = { staff: principal('STAFF_MFA', ['settings.manage']), stale: principal('STAFF_MFA', ['settings.manage'], true),
  customer: principal('CUSTOMER_OTP', ['settings.manage']), unprivileged: principal('STAFF_MFA', []) };
const resolver = { resolveBearerToken: vi.fn(async (authorization?: string) => {
  const token = authorization?.replace('Bearer ', '') as keyof typeof principals;
  if (token in principals) return principals[token];
  throw new AuthSessionException('AUTH_SESSION_INVALID');
}) };
const service = { current: vi.fn(async () => null), update: vi.fn(async () => ({ id: 'revision-test', version: 1 })) };
@Module({ imports: [ApiFoundationModule], controllers: [InvoicePolicyController], providers: [
  { provide: InvoicePolicyService, useValue: service }, { provide: AuthPrincipalService, useValue: resolver },
  { provide: APP_GUARD, useValue: new AuthGuard(resolver as unknown as AuthPrincipalService, { record: vi.fn(async () => undefined) } as unknown as AuditLogService) },
] }) class TestModule {}

describe('Store invoice configuration HTTP authorization/contract', () => {
  let app: INestApplication; let origin: string;
  const input = { sellerName: 'آزمون', sellerAddress: 'نشانی آزمون', sellerContact: 'example.test', taxTreatment: 'EXCLUSIVE', taxRateBps: 1000,
    exemptionReason: null, discountCapBps: 2000, shippingTaxable: false, isActive: false, expectedVersion: null, reason: 'تنظیم آزمون' };
  const call = (method: 'GET' | 'PUT', token?: string, body: unknown = input, key = 'test-key') => fetch(`${origin}/api/v1/settings/admin/invoice-policy`, {
    method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json', ...(key ? { 'idempotency-key': key } : {}) }, body: method === 'PUT' ? JSON.stringify(body) : undefined,
  });
  beforeAll(async () => {
    app = await NestFactory.create(TestModule, { logger: false }); app.setGlobalPrefix('api'); app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    await app.listen(0, '127.0.0.1'); origin = await app.getUrl();
  });
  beforeEach(() => vi.clearAllMocks()); afterAll(async () => app.close());
  it('denies anonymous/customer/missing current permission on every action', async () => {
    for (const method of ['GET', 'PUT'] as const) {
      expect((await call(method)).status).toBe(401);
      expect((await call(method, 'customer')).status).toBe(403);
      expect((await call(method, 'unprivileged')).status).toBe(403);
    }
    expect(service.current).not.toHaveBeenCalled(); expect(service.update).not.toHaveBeenCalled();
  });
  it('allows safe stale-session reads but requires fresh MFA for policy revision', async () => {
    expect(await (await call('GET', 'stale')).json()).toEqual({ data: { policy: null } });
    expect((await call('PUT', 'stale')).status).toBe(401); expect(service.update).not.toHaveBeenCalled();
    expect((await call('PUT', 'staff')).status).toBe(200);
    expect(service.update).toHaveBeenCalledWith('operator', expect.any(String), input, 'test-key');
  });
  it.each([{ actorId: 'spoof' }, { version: 100 }, { requestId: 'spoof' }, { customerId: 'other' }, { taxRateBps: 1.5 }, { taxRateBps: 10001 },
    { expectedVersion: undefined }, { exemptionReason: undefined }, { shippingTaxable: undefined }, { discountCapBps: undefined }, { taxTreatment: 'DEFAULT' }, { reason: '' }])('rejects undeclared/missing/invalid fields before mutation', async patch => {
    expect((await call('PUT', 'staff', { ...input, ...patch })).status).toBe(400); expect(service.update).not.toHaveBeenCalled();
  });
  it('requires a bounded idempotency header', async () => {
    expect((await call('PUT', 'staff', input, '')).status).toBe(400);
    expect((await call('PUT', 'staff', input, 'x'.repeat(129))).status).toBe(400);
    expect(service.update).not.toHaveBeenCalled();
  });
});
