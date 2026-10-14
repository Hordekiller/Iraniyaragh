import 'reflect-metadata';
import { Module, VersioningType } from '@nestjs/common';
import { APP_GUARD, NestFactory, type INestApplication } from '@nestjs/core';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiFoundationModule } from '../../common/api-foundation.module';
import { AuditLogService } from '../audit/audit-log.service';
import { AuthGuard } from '../auth/auth.guard';
import { AuthPrincipalService, type AuthPrincipalContext } from '../auth/auth-principal.service';
import { AuthSessionException } from '../auth/auth-session.service';
import { InventoryCostPolicyController } from './inventory-cost-policy.controller';
import { InventoryCostPolicyService } from './inventory-cost-policy.service';

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
const service = { read: vi.fn(async () => ({ policy: null, valuationEnabled: false, activationGate: 'COST_LEDGER_ACCEPTANCE_REQUIRED', missingCostTreatment: 'REQUIRE_EVIDENCE' })), revise: vi.fn(async () => ({ policy: { id: 'revision-test', version: 1, method: null }, valuationEnabled: false })) };
@Module({ imports: [ApiFoundationModule], controllers: [InventoryCostPolicyController], providers: [
  { provide: InventoryCostPolicyService, useValue: service }, { provide: AuthPrincipalService, useValue: resolver },
  { provide: APP_GUARD, useValue: new AuthGuard(resolver as unknown as AuthPrincipalService, { record: vi.fn(async () => undefined) } as unknown as AuditLogService) },
] }) class TestModule {}

describe('Inventory cost configuration authoritative HTTP guards', () => {
  let app: INestApplication; let origin: string;
  const input = { method: null, expectedVersion: null, reason: 'انتخاب بعد از بررسی' };
  const call = (method: 'GET' | 'PUT', token?: string, body: unknown = input, key = 'test-key') => fetch(`${origin}/api/v1/settings/admin/inventory-cost-policy`, {
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
    expect(service.read).not.toHaveBeenCalled(); expect(service.revise).not.toHaveBeenCalled();
  });
  it('allows safe stale-session reads but requires fresh MFA for policy revision', async () => {
    expect(await (await call('GET', 'stale')).json()).toEqual({ data: { policy: null, valuationEnabled: false, activationGate: 'COST_LEDGER_ACCEPTANCE_REQUIRED', missingCostTreatment: 'REQUIRE_EVIDENCE' } });
    expect((await call('PUT', 'stale')).status).toBe(401); expect(service.revise).not.toHaveBeenCalled();
    expect((await call('PUT', 'staff')).status).toBe(200);
    expect(service.revise).toHaveBeenCalledWith('operator', expect.any(String), input, 'test-key');
  });
  it.each([{ actorId: 'spoof' }, { version: 100 }, { requestId: 'spoof' }, { valuationEnabled: true }, { isActive: true }, { openingCost: '0' }, { method: 'DEFAULT' }, { method: undefined }, { expectedVersion: undefined }, { expectedVersion: 0 }, { reason: '' }])('rejects undeclared/missing/invalid fields before mutation', async patch => {
    expect((await call('PUT', 'staff', { ...input, ...patch })).status).toBe(400); expect(service.revise).not.toHaveBeenCalled();
  });
  it('requires a bounded idempotency header', async () => {
    expect((await call('PUT', 'staff', input, '')).status).toBe(400);
    expect((await call('PUT', 'staff', input, 'x'.repeat(129))).status).toBe(400);
    expect(service.revise).not.toHaveBeenCalled();
  });
});
