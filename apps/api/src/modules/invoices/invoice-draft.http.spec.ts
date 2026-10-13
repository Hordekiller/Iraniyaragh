import 'reflect-metadata';
import { Module, VersioningType } from '@nestjs/common';
import { APP_GUARD, NestFactory, type INestApplication } from '@nestjs/core';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiFoundationModule } from '../../common/api-foundation.module';
import { AuditLogService } from '../audit/audit-log.service';
import { AuthGuard } from '../auth/auth.guard';
import { AuthPrincipalService, type AuthPrincipalContext } from '../auth/auth-principal.service';
import { AuthSessionException } from '../auth/auth-session.service';
import { InvoiceDraftController } from './invoice-draft.controller';
import { InvoiceDraftService } from './invoice-draft.service';
const principal = (level: 'CUSTOMER_OTP' | 'STAFF_MFA', permissions: string[]): AuthPrincipalContext => ({
  userId: 'operator', sessionId: 'session-test', tokenId: 'token-test', authenticationLevel: level, permissions: new Set(permissions),
  authenticatedAt: new Date(Date.now() - 600000), accessExpiresAt: new Date(Date.now() + 600000),
});
const principals = { staff: principal('STAFF_MFA', ['invoices.read','invoices.manage']), reader: principal('STAFF_MFA', ['invoices.read']),
  manageOnly: principal('STAFF_MFA', ['invoices.manage']), customer: principal('CUSTOMER_OTP', ['invoices.read','invoices.manage']), unprivileged: principal('STAFF_MFA', []) };
const resolver = { resolveBearerToken: vi.fn(async (authorization?: string) => {
  const token = authorization?.replace('Bearer ', '') as keyof typeof principals;
  if (token in principals) return principals[token]; throw new AuthSessionException('AUTH_SESSION_INVALID');
}) };
const service = { list: vi.fn(async () => ({ items: [], count: 0 })), read: vi.fn(async () => ({ id: 'draft-test' })), history: vi.fn(async () => ({ items: [], count: 0 })),
  options: vi.fn(async () => ({ data: { items: [], count: 0 } })), create: vi.fn(async () => ({ draft: { id: 'draft-test' } })), edit: vi.fn(async () => ({})),
  fromOrder: vi.fn(async () => ({})), requote: vi.fn(async () => ({})), cancel: vi.fn(async () => ({})) };
@Module({ imports: [ApiFoundationModule], controllers: [InvoiceDraftController], providers: [
  { provide: InvoiceDraftService, useValue: service }, { provide: AuthPrincipalService, useValue: resolver },
  { provide: APP_GUARD, useValue: new AuthGuard(resolver as unknown as AuthPrincipalService, { record: vi.fn(async () => undefined) } as unknown as AuditLogService) },
] }) class TestModule {}
const input = { customerId: 'real-customer', address: { provinceCode: 'THR', city: 'Test', address: 'Test address', postalCode: '1234567890', recipient: 'Test buyer', mobile: '+989120000000' },
  lines: [{ variantId: 'real-sku', quantity: 2, discount: '0' }], globalDiscount: '0', shippingMethodCode: 'PICKUP', note: null };
const edits = { address: input.address, lines: input.lines, globalDiscount: '0', shippingMethodCode: 'PICKUP', note: null, expectedVersion: 0 };
const routes = [{ method: 'GET', path: '', body: undefined }, { method: 'GET', path: '/draft-test', body: undefined }, { method: 'GET', path: '/draft-test/history', body: undefined },
  { method: 'GET', path: '/options?kind=customer', body: undefined }, { method: 'POST', path: '', body: input }, { method: 'PUT', path: '/draft-test', body: edits },
  { method: 'POST', path: '/from-order/order-test', body: { expectedOrderVersion: 0, note: null } }, { method: 'POST', path: '/draft-test/requote', body: { expectedVersion: 0 } },
  { method: 'POST', path: '/draft-test/cancel', body: { expectedVersion: 0, reason: 'Test cancellation' } }];
describe('Independent invoice draft HTTP RBAC and strict contract', () => {
  let app: INestApplication; let origin: string;
  const call = (route: typeof routes[number], token?: string, payload = route.body, key = 'test-key') => fetch(`${origin}/api/v1/invoices/admin/drafts${route.path}`, {
    method: route.method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json', ...(key ? { 'idempotency-key': key } : {}) },
    body: route.method !== 'GET' ? JSON.stringify(payload) : undefined,
  });
  beforeAll(async () => { app = await NestFactory.create(TestModule, { logger: false }); app.setGlobalPrefix('api'); app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' }); await app.listen(0, '127.0.0.1'); origin = await app.getUrl(); });
  beforeEach(() => vi.clearAllMocks()); afterAll(async () => app.close());
  it('denies anonymous, customers and revoked permission on every route', async () => {
    for (const route of routes) for (const token of [undefined,'customer','unprivileged']) expect((await call(route, token)).status).toBe(token ? 403 : 401);
    for (const action of Object.values(service)) expect(action).not.toHaveBeenCalled();
  });
  it('allows reads only with read permission and requires both manage and read for every write/option query', async () => {
    for (const route of routes) {
      const readonly = route.method === 'GET' && !route.path.startsWith('/options');
      expect((await call(route, 'reader')).status).toBe(readonly ? 200 : 403);
      expect((await call(route, 'manageOnly')).status).toBe(403);
      expect((await call(route, 'staff')).status).toBe(route.method === 'POST' ? 201 : 200);
    }
    // Editable quotations are not financial issuance: stale but valid staff sessions can edit them.
    expect(service.create).toHaveBeenCalledWith('operator', expect.any(String), input, 'test-key');
  });
  it.each([{ unitPrice: '1' }, { status: 'PAID' }, { actorId: 'spoof' }, { shippingAmount: '0' }, { taxRateBps: 0 },
    { lines: [{ ...input.lines[0], unitPrice: '1' }] }, { lines: [{ ...input.lines[0], quantity: 1.5 }] }, { lines: [] }, { globalDiscount: '1.5' }, { note: undefined },
    { address: { ...input.address, ownerId: 'spoof' } }])('rejects arbitrary money/state/identity and invalid fields before any mutation', async patch => {
    expect((await call(routes[4], 'staff', { ...input, ...patch })).status).toBe(400); expect(service.create).not.toHaveBeenCalled();
  });
  it('rejects customer/source mutation in edit and missing/bounded command keys', async () => {
    expect((await call(routes[5], 'staff', { ...edits, customerId: 'other' } as typeof edits)).status).toBe(400);
    for (const route of routes.filter(route => route.method !== 'GET')) for (const key of ['', 'x'.repeat(129)]) expect((await call(route, 'staff', route.body, key)).status).toBe(400);
    for (const action of [service.create,service.edit,service.fromOrder,service.requote,service.cancel]) expect(action).not.toHaveBeenCalled();
  });
  it('rejects malformed pagination/options before querying the database', async () => {
    expect((await call({ ...routes[0], path: '?offset=-1' }, 'staff')).status).toBe(400);
    expect((await call({ ...routes[3], path: '/options?kind=secret' }, 'staff')).status).toBe(400);
    expect(service.options).not.toHaveBeenCalled(); expect(service.list).not.toHaveBeenCalled();
  });
});
