import 'reflect-metadata';
import { Module, VersioningType } from '@nestjs/common';
import { APP_GUARD, NestFactory, type INestApplication } from '@nestjs/core';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiFoundationModule } from '../../common/api-foundation.module';
import { AuditLogService } from '../audit/audit-log.service';
import { AuthGuard } from '../auth/auth.guard';
import { AuthPrincipalService, type AuthPrincipalContext } from '../auth/auth-principal.service';
import { AuthSessionException } from '../auth/auth-session.service';
import { ReturnsController, ReturnsPublicController } from './returns.controller';
import { ReturnsService } from './returns.service';

const principal = (level: 'CUSTOMER_OTP' | 'STAFF_MFA', permissions: string[], stale = false): AuthPrincipalContext => ({
  userId: 'operator', sessionId: 'session', tokenId: 'token', authenticationLevel: level, permissions: new Set(permissions),
  authenticatedAt: new Date(Date.now() - (stale ? 600_000 : 1000)), accessExpiresAt: new Date(Date.now() + 600_000),
});
const principals = {
  reader: principal('STAFF_MFA', ['returns.read']),
  manager: principal('STAFF_MFA', ['returns.read', 'returns.manage']),
  staleManager: principal('STAFF_MFA', ['returns.read', 'returns.manage'], true),
  refunder: principal('STAFF_MFA', ['payments.refund', 'returns.manage']),
  staleRefunder: principal('STAFF_MFA', ['payments.refund', 'returns.manage'], true),
  moneyOnly: principal('STAFF_MFA', ['payments.refund']),
  settings: principal('STAFF_MFA', ['settings.manage']),
  staleSettings: principal('STAFF_MFA', ['settings.manage'], true),
  none: principal('STAFF_MFA', []),
  customer: principal('CUSTOMER_OTP', ['returns.read', 'returns.manage', 'payments.refund', 'settings.manage']),
};
const resolver = { resolveBearerToken: vi.fn(async (authorization?: string) => {
  const token = authorization?.replace('Bearer ', '') as keyof typeof principals;
  if (token in principals) return principals[token];
  throw new AuthSessionException('AUTH_SESSION_INVALID');
}) };

const view = { id: 'r1' };
const service = {
  eligibility: vi.fn(async () => ({ data: { eligible: true } })),
  create: vi.fn(async () => ({ data: view })),
  list: vi.fn(async () => ({ data: { items: [], meta: { page: 1, perPage: 25, total: 0, pages: 1 } } })),
  get: vi.fn(async () => ({ data: view })),
  recordRefund: vi.fn(async () => ({ data: { orderReturn: view, refundId: 'rf1', paymentStatus: 'REFUNDED' } })),
  readSettings: vi.fn(async () => ({ data: { enabled: false, version: 0, updatedAt: null } })),
  updateSettings: vi.fn(async () => ({ data: { enabled: true, version: 1, updatedAt: null } })),
  readPublicConfig: vi.fn(async () => ({ data: { enabled: false } })),
  listHolidays: vi.fn(async () => ({ data: { items: [] } })),
  addHoliday: vi.fn(async () => ({ data: { id: 'h1' } })),
  removeHoliday: vi.fn(async () => ({ data: { id: 'h1' } })),
};

@Module({ imports: [ApiFoundationModule], controllers: [ReturnsController, ReturnsPublicController], providers: [
  { provide: ReturnsService, useValue: service }, { provide: AuthPrincipalService, useValue: resolver },
  { provide: APP_GUARD, useValue: new AuthGuard(resolver as unknown as AuthPrincipalService, { record: vi.fn(async () => undefined) } as unknown as AuditLogService) },
] })
class TestModule {}

const goodLine = { orderItemId: 'item1', quantity: 1, disposition: 'RESTOCK', warehouseId: 'w1', locationId: 'l1' };
const goodReturn = { reason: 'Customer changed their mind', lines: [goodLine] };
const goodRefund = { amountMinorUnits: '1000', gatewayReferenceId: 'ZP-1', reason: 'Return settled' };

describe('returns HTTP security and contract', () => {
  let app: INestApplication;
  let origin: string;
  const call = (method: string, path: string, token?: string, input?: unknown, key: string | null = 'ret-key-1') =>
    fetch(`${origin}/api/v1/returns/admin${path}`, {
      method,
      headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json', ...(key ? { 'idempotency-key': key } : {}) },
      body: input === undefined ? undefined : JSON.stringify(input),
    });

  beforeAll(async () => {
    app = await NestFactory.create(TestModule, { logger: false });
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    await app.listen(0, '127.0.0.1');
    origin = await app.getUrl();
  });
  beforeEach(() => vi.clearAllMocks());
  afterAll(async () => app.close());

  it('requires a STAFF_MFA principal on every route (anonymous 401, customer 403, no permission 403)', async () => {
    const routes = [
      ['GET', '/'], ['GET', '/r1'], ['GET', '/orders/o1/eligibility'], ['POST', '/orders/o1', goodReturn], ['POST', '/r1/refund', goodRefund],
      ['GET', '/settings'], ['PUT', '/settings', { expectedVersion: 0, enabled: true }], ['GET', '/holidays'], ['POST', '/holidays', { dateKey: '2026-03-21', label: 'Nowruz' }], ['DELETE', '/holidays/h1'],
    ] as const;
    for (const [method, path, body] of routes) {
      expect((await call(method, path, undefined, body)).status, `${method} ${path} anonymous`).toBe(401);
      expect((await call(method, path, 'customer', body)).status, `${method} ${path} customer`).toBe(403);
      expect((await call(method, path, 'none', body)).status, `${method} ${path} no permission`).toBe(403);
    }
    for (const fn of Object.values(service)) expect(fn).not.toHaveBeenCalled();
  });

  it('separates reading from recording, and recording from settling money', async () => {
    expect((await call('GET', '/orders/o1/eligibility', 'reader')).status).toBe(200);
    expect((await call('GET', '/', 'reader')).status).toBe(200);
    expect((await call('GET', '/r1', 'reader')).status).toBe(200);
    expect((await call('POST', '/orders/o1', 'reader', goodReturn)).status).toBe(403);
    expect((await call('POST', '/r1/refund', 'manager', goodRefund)).status).toBe(403); // no payments.refund
    expect((await call('POST', '/r1/refund', 'moneyOnly', goodRefund)).status).toBe(403); // no returns.manage
    expect(service.create).not.toHaveBeenCalled();
    expect(service.recordRefund).not.toHaveBeenCalled();
  });

  it('does not read the static holidays path as a return id', async () => {
    expect((await call('GET', '/holidays', 'settings')).status).toBe(200);
    expect(service.listHolidays).toHaveBeenCalledTimes(1);
    expect(service.get).not.toHaveBeenCalled();
  });

  it('requires fresh MFA and an idempotency key to record a return', async () => {
    expect((await call('POST', '/orders/o1', 'staleManager', goodReturn)).status).toBe(401);
    expect((await call('POST', '/orders/o1', 'manager', goodReturn, null)).status).toBe(400);
    expect(service.create).not.toHaveBeenCalled();
    const ok = await call('POST', '/orders/o1', 'manager', goodReturn);
    expect(ok.status).toBe(201);
    expect(service.create).toHaveBeenCalledWith('o1', expect.objectContaining({ reason: 'Customer changed their mind' }), { actorId: 'operator', requestId: expect.any(String), idempotencyKey: 'ret-key-1' });
  });

  it('rejects malformed or spoofed return bodies before they reach the service', async () => {
    const bad = [
      { ...goodReturn, actorId: 'spoofed' },
      { ...goodReturn, windowKind: 'DELIVERY' },
      { ...goodReturn, refundDue: '1' },
      { reason: '', lines: [goodLine] },
      { reason: 'x', lines: [] },
      { reason: 'x', lines: Array.from({ length: 51 }, () => goodLine) },
      { reason: 'x', lines: [{ ...goodLine, quantity: 0 }] },
      { reason: 'x', lines: [{ ...goodLine, quantity: 1.5 }] },
      { reason: 'x', lines: [{ ...goodLine, disposition: 'SELL' }] },
      { reason: 'x', lines: [{ ...goodLine, unitPrice: '1' }] },
      { reason: 'x'.repeat(501), lines: [goodLine] },
    ];
    for (const body of bad) expect((await call('POST', '/orders/o1', 'manager', body)).status).toBe(400);
    expect(service.create).not.toHaveBeenCalled();
  });

  it('requires fresh MFA, both permissions and a strict body to record the settling refund', async () => {
    expect((await call('POST', '/r1/refund', 'staleRefunder', goodRefund)).status).toBe(401);
    expect((await call('POST', '/r1/refund', 'refunder', goodRefund, null)).status).toBe(400);
    expect((await call('POST', '/r1/refund', 'refunder', { ...goodRefund, paymentId: 'other' })).status).toBe(400);
    expect((await call('POST', '/r1/refund', 'refunder', { ...goodRefund, amountMinorUnits: '-5' })).status).toBe(400);
    expect(service.recordRefund).not.toHaveBeenCalled();
    expect((await call('POST', '/r1/refund', 'refunder', goodRefund)).status).toBe(200);
    expect(service.recordRefund).toHaveBeenCalledWith('r1', null, expect.objectContaining({ amountMinorUnits: '1000' }), { actorId: 'operator', requestId: expect.any(String), idempotencyKey: 'ret-key-1' });
  });

  it('keeps the on/off switch behind settings.manage, fresh MFA and a strict body', async () => {
    expect((await call('GET', '/settings', 'manager')).status).toBe(403); // returns.manage is not settings.manage
    expect((await call('PUT', '/settings', 'manager', { expectedVersion: 0, enabled: true })).status).toBe(403);
    expect((await call('PUT', '/settings', 'staleSettings', { expectedVersion: 0, enabled: true })).status).toBe(401);
    for (const body of [{ enabled: true }, { expectedVersion: 0 }, { expectedVersion: -1, enabled: true }, { expectedVersion: 0, enabled: 'yes' }, { expectedVersion: 0, enabled: true, extra: 1 }]) {
      expect((await call('PUT', '/settings', 'settings', body)).status).toBe(400);
    }
    expect(service.updateSettings).not.toHaveBeenCalled();
    const read = await call('GET', '/settings', 'settings');
    expect(read.status).toBe(200);
    expect(read.headers.get('cache-control')).toBe('no-store');
    expect((await call('PUT', '/settings', 'settings', { expectedVersion: 0, enabled: true })).status).toBe(200);
    expect(service.updateSettings).toHaveBeenCalledWith('operator', expect.any(String), { expectedVersion: 0, enabled: true });
    expect(service.get).not.toHaveBeenCalled(); // `settings` is never read as a return id
  });

  it('serves the public config anonymously, briefly cached and without any detail', async () => {
    const response = await fetch(`${origin}/api/v1/returns/public/config`);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('public');
    expect(await response.json()).toEqual({ data: { enabled: false } });
  });

  it('bounds list pagination', async () => {
    for (const query of ['page=0', 'perPage=0', 'perPage=101', 'page=abc', 'extra=1']) expect((await call('GET', `/?${query}`, 'reader')).status, query).toBe(400);
    expect((await call('GET', '/?page=2&perPage=10&orderNumber=A-1', 'reader')).status).toBe(200);
    expect(service.list).toHaveBeenCalledWith(expect.objectContaining({ page: 2, perPage: 10, orderNumber: 'A-1' }));
  });

  it('validates holiday input', async () => {
    for (const body of [{ dateKey: '21-03-2026', label: 'x' }, { dateKey: '2026-03-21' }, { dateKey: '2026-03-21', label: '' }, { dateKey: '2026-03-21', label: 'x', extra: 1 }]) {
      expect((await call('POST', '/holidays', 'settings', body)).status).toBe(400);
    }
    expect(service.addHoliday).not.toHaveBeenCalled();
    expect((await call('POST', '/holidays', 'settings', { dateKey: '2026-03-21', label: 'Nowruz' })).status).toBe(201);
    expect((await call('DELETE', '/holidays/h1', 'settings')).status).toBe(200);
  });
});
