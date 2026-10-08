import 'reflect-metadata';
import { Module, VersioningType } from '@nestjs/common';
import { APP_GUARD, NestFactory, type INestApplication } from '@nestjs/core';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiFoundationModule } from '../../common/api-foundation.module';
import { AuditLogService } from '../audit/audit-log.service';
import { AuthGuard } from '../auth/auth.guard';
import { AuthPrincipalService, type AuthPrincipalContext } from '../auth/auth-principal.service';
import { AuthSessionException } from '../auth/auth-session.service';
import { ShippingSettingsController } from './shipping-settings.controller';
import { ShippingSettingsService } from './shipping-settings.service';

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
const service = { list: vi.fn(async () => []), update: vi.fn(async () => ({ code: 'post', version: 0 })) };
@Module({ imports: [ApiFoundationModule], controllers: [ShippingSettingsController], providers: [
  { provide: ShippingSettingsService, useValue: service }, { provide: AuthPrincipalService, useValue: resolver },
  { provide: APP_GUARD, useValue: new AuthGuard(resolver as unknown as AuthPrincipalService, { record: vi.fn(async () => undefined) } as unknown as AuditLogService) },
] })
class TestModule {}

describe('Shipping settings protected HTTP contract', () => {
  let app: INestApplication; let origin: string;
  const input = { title: 'پست', amount: { amount: '50000', currency: 'IRR' }, isActive: false, expectedVersion: null };
  const call = (method: 'GET' | 'PUT', token?: string, body: unknown = input, key: string | undefined = 'test-key') => fetch(`${origin}/api/v1/settings/admin/shipping-methods${method === 'PUT' ? '/post' : ''}`, {
    method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json', ...(key ? { 'idempotency-key': key } : {}) }, body: method === 'PUT' ? JSON.stringify(body) : undefined,
  });
  beforeAll(async () => {
    app = await NestFactory.create(TestModule, { logger: false }); app.setGlobalPrefix('api'); app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    await app.listen(0, '127.0.0.1'); origin = await app.getUrl();
  });
  beforeEach(() => vi.clearAllMocks());
  afterAll(async () => app.close());

  it('requires current staff MFA and settings.manage for reads and writes', async () => {
    for (const method of ['GET', 'PUT'] as const) {
      expect((await call(method)).status).toBe(401);
      expect((await call(method, 'customer')).status).toBe(403);
      expect((await call(method, 'unprivileged')).status).toBe(403);
    }
    expect(service.list).not.toHaveBeenCalled(); expect(service.update).not.toHaveBeenCalled();
  });
  it('permits safe reads but requires fresh MFA for tariff mutation', async () => {
    expect((await call('GET', 'stale')).status).toBe(200);
    expect((await call('PUT', 'stale')).status).toBe(401);
    expect(service.update).not.toHaveBeenCalled();
    expect((await call('PUT', 'staff')).status).toBe(200);
    expect(service.update).toHaveBeenCalledWith('operator', expect.any(String), 'post', input, 'test-key');
  });
  it.each([
    { ...input, actorId: 'another-user' }, { ...input, expectedVersion: undefined }, { ...input, expectedVersion: -1 },
    { ...input, amount: { amount: '1.5', currency: 'IRR' } }, { ...input, amount: { amount: '100', currency: 'IRT' } },
  ])('rejects undeclared ownership/version/currency fields before mutation', async (body) => {
    expect((await call('PUT', 'staff', body)).status).toBe(400);
    expect(service.update).not.toHaveBeenCalled();
  });
  it('requires a bounded idempotency header', async () => {
    expect((await call('PUT', 'staff', input, '')).status).toBe(400);
    expect(service.update).not.toHaveBeenCalled();
  });
});
