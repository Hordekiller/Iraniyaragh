import 'reflect-metadata';
import { Module, VersioningType } from '@nestjs/common';
import { APP_GUARD, NestFactory, type INestApplication } from '@nestjs/core';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiFoundationModule } from '../../common/api-foundation.module';
import { AuditLogService } from '../audit/audit-log.service';
import { AuthGuard } from '../auth/auth.guard';
import { AuthPrincipalService, type AuthPrincipalContext } from '../auth/auth-principal.service';
import { AuthSessionException } from '../auth/auth-session.service';
import { PromotionAdminController } from './promotion-admin.controller';
import { PromotionAdminService } from './promotion-admin.service';

const principal = (level: 'CUSTOMER_OTP' | 'STAFF_MFA', permissions: string[], stale = false): AuthPrincipalContext => ({
  userId: 'operator', sessionId: 'test-session', tokenId: 'test-token', authenticationLevel: level, permissions: new Set(permissions),
  authenticatedAt: new Date(Date.now() - (stale ? 600000 : 1000)), accessExpiresAt: new Date(Date.now() + 600000),
});
const principals = {
  manager: principal('STAFF_MFA', ['promotions.read', 'promotions.manage', 'reports.read']),
  staleManager: principal('STAFF_MFA', ['promotions.read', 'promotions.manage'], true),
  reader: principal('STAFF_MFA', ['promotions.read']),
  reporter: principal('STAFF_MFA', ['reports.read']),
  // The previous permission must no longer open the promotions API.
  settingsOnly: principal('STAFF_MFA', ['settings.manage']),
  customer: principal('CUSTOMER_OTP', ['promotions.read', 'promotions.manage', 'reports.read']),
  none: principal('STAFF_MFA', []),
};
const resolver = { resolveBearerToken: vi.fn(async (authorization?: string) => {
  const token = authorization?.replace('Bearer ', '') as keyof typeof principals;
  if (token in principals) return principals[token];
  throw new AuthSessionException('AUTH_SESSION_INVALID');
}) };
const service = {
  list: vi.fn(async () => ({ items: [], total: 0 })), get: vi.fn(async () => ({ id: 'p1' })), listCoupons: vi.fn(async () => ({ items: [], total: 0 })),
  report: vi.fn(async () => []), redemptions: vi.fn(async () => ({ items: [], total: 0 })),
  create: vi.fn(async () => ({ id: 'p1' })), update: vi.fn(async () => ({ id: 'p1' })), setActive: vi.fn(async () => ({ id: 'p1' })),
  generateCoupons: vi.fn(async () => []), setCouponActive: vi.fn(async () => ({ id: 'c1' })),
};
@Module({ imports: [ApiFoundationModule], controllers: [PromotionAdminController], providers: [
  { provide: PromotionAdminService, useValue: service }, { provide: AuthPrincipalService, useValue: resolver },
  { provide: APP_GUARD, useValue: new AuthGuard(resolver as unknown as AuthPrincipalService, { record: vi.fn(async () => undefined) } as unknown as AuditLogService) },
] }) class TestModule {}

describe('Promotions admin HTTP authorization', () => {
  let app: INestApplication; let origin: string;
  const call = (method: string, path: string, token?: string, body: unknown = {}) => fetch(`${origin}/api/v1/promotions/admin${path}`, {
    method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json', 'idempotency-key': 'promo-test-key-1' },
    body: method === 'GET' ? undefined : JSON.stringify(body),
  });
  const reads: Array<[string, string, string]> = [['', 'promotions.read', 'list'], ['/p1', 'promotions.read', 'get'], ['/coupons/by-promotion/p1', 'promotions.read', 'listCoupons'], ['/report', 'reports.read', 'report'], ['/redemptions', 'reports.read', 'redemptions']];
  const writes: Array<[string, string, string]> = [['POST', '', 'create'], ['PUT', '/p1', 'update'], ['PUT', '/p1/active', 'setActive'], ['POST', '/p1/coupons', 'generateCoupons'], ['PUT', '/coupons/c1/active', 'setCouponActive']];
  beforeAll(async () => {
    app = await NestFactory.create(TestModule, { logger: false }); app.setGlobalPrefix('api'); app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    await app.listen(0, '127.0.0.1'); origin = await app.getUrl();
  });
  beforeEach(() => vi.clearAllMocks()); afterAll(async () => app.close());

  it('rejects anonymous, customer-level, permissionless and legacy settings-only principals on every action', async () => {
    for (const [path] of reads) for (const token of [undefined, 'customer', 'none', 'settingsOnly']) expect((await call('GET', path, token)).status, `${path} ${token}`).toBe(token === undefined ? 401 : 403);
    for (const [method, path] of writes) for (const token of [undefined, 'customer', 'none', 'settingsOnly', 'reader', 'reporter']) expect((await call(method, path, token)).status, `${method} ${path} ${token}`).toBe(token === undefined ? 401 : 403);
    for (const fn of Object.values(service)) expect(fn).not.toHaveBeenCalled();
  });

  it('keeps read permissions explicit: promotions.read does not open reports and reports.read does not open campaigns', async () => {
    expect((await call('GET', '', 'reader')).status).toBe(200);
    expect((await call('GET', '/report', 'reader')).status).toBe(403);
    expect((await call('GET', '/redemptions', 'reader')).status).toBe(403);
    expect((await call('GET', '/report', 'reporter')).status).toBe(200);
    expect((await call('GET', '', 'reporter')).status).toBe(403);
  });

  it('requires promotions.manage plus fresh MFA for every mutation', async () => {
    for (const [method, path, fn] of writes) {
      const stale = await call(method, path, 'staleManager');
      expect(stale.status, `${method} ${path} stale`).toBe(401);
      expect(service[fn as keyof typeof service]).not.toHaveBeenCalled();
    }
    expect((await call('PUT', '/p1/active', 'manager', { isActive: false, expectedVersion: 1 })).status).toBe(200);
    expect(service.setActive).toHaveBeenCalledOnce();
  });
});
