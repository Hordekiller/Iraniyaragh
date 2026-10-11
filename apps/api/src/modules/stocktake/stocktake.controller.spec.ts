import { Module, ValidationPipe, VersioningType } from '@nestjs/common';
import { APP_GUARD, NestFactory, type INestApplication } from '@nestjs/core';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiFoundationModule } from '../../common/api-foundation.module';
import { AuditLogService } from '../audit/audit-log.service';
import { AuthGuard, REQUIRE_AUTH_LEVEL, REQUIRE_FRESH_AUTH, REQUIRE_PERMISSION } from '../auth/auth.guard';
import { AuthPrincipalService, type AuthPrincipalContext } from '../auth/auth-principal.service';
import { AuthSessionException } from '../auth/auth-session.service';
import { StocktakeController } from './stocktake.controller';
import { StocktakeService } from './stocktake.service';
import { StocktakeActionDto, StocktakeCountDto, StocktakeCreateDto, StocktakeHistoryQueryDto, StocktakeListQueryDto, StocktakeLocationQueryDto, StocktakeVariantQueryDto } from './stocktake.dto';

// Vitest's esbuild transform omits TS design metadata. Supply the same types
// emitted by the compiled API so Nest can run the actual DTO validation pipe.
Reflect.defineMetadata('design:paramtypes', [StocktakeService], StocktakeController);
for (const [method, types] of Object.entries({
  list: [Object, StocktakeListQueryDto], warehouses: [StocktakeVariantQueryDto], locations: [StocktakeLocationQueryDto],
  variants: [StocktakeVariantQueryDto], history: [String, StocktakeHistoryQueryDto],
  create: [Object, String, StocktakeCreateDto], start: [Object, String, String, StocktakeActionDto],
  count: [Object, String, String, StocktakeCountDto], submit: [Object, String, String, StocktakeActionDto],
  approve: [Object, String, String, StocktakeActionDto], cancel: [Object, String, String, StocktakeActionDto],
})) Reflect.defineMetadata('design:paramtypes', types, StocktakeController.prototype, method);

const service = Object.fromEntries(['list', 'get', 'history', 'warehouses', 'locations', 'variants', 'create', 'start', 'count', 'submit', 'approve', 'cancel']
  .map(method => [method, vi.fn().mockResolvedValue({ items: [], count: 0 })]));
const staff: AuthPrincipalContext = { userId: 'stocktake-staff', sessionId: 'test-session', tokenId: 'test-token-id',
  authenticationLevel: 'STAFF_MFA', authenticatedAt: new Date(), accessExpiresAt: new Date(Date.now() + 600_000),
  permissions: new Set(['stocktake.read', 'stocktake.manage', 'stocktake.count', 'stocktake.approve']) };
let current = staff;
const principals = { resolveBearerToken: vi.fn(async (authorization?: string) => {
  if (authorization !== 'Bearer isolated-test-token') throw new AuthSessionException('AUTH_SESSION_INVALID');
  return current;
}) };
const audit = { record: vi.fn().mockResolvedValue(undefined) };

@Module({ imports: [ApiFoundationModule], controllers: [StocktakeController], providers: [
  { provide: StocktakeService, useValue: service },
  { provide: APP_GUARD, useValue: new AuthGuard(principals as unknown as AuthPrincipalService, audit as unknown as AuditLogService) },
] })
class StocktakeHttpTestModule {}

const routes = [
  ['list', 'GET', '', 'stocktake.read', undefined],
  ['warehouses', 'GET', '/warehouses', 'stocktake.read', undefined],
  ['locations', 'GET', '/locations', 'stocktake.read', undefined],
  ['variants', 'GET', '/variants', 'stocktake.read', undefined],
  ['get', 'GET', '/session-id', 'stocktake.read', undefined],
  ['history', 'GET', '/session-id/history', 'stocktake.read', undefined],
  ['create', 'POST', '', 'stocktake.manage', { warehouseId: 'warehouse-id' }],
  ['start', 'POST', '/session-id/start', 'stocktake.manage', { expectedVersion: 0 }],
  ['count', 'POST', '/session-id/counts', 'stocktake.count', { expectedVersion: 1, lines: [{ locationId: 'location', variantId: 'variant', countedQty: 0 }] }],
  ['submit', 'POST', '/session-id/submit', 'stocktake.manage', { expectedVersion: 2 }],
  ['approve', 'POST', '/session-id/approve', 'stocktake.approve', { expectedVersion: 3 }],
  ['cancel', 'POST', '/session-id/cancel', 'stocktake.manage', { expectedVersion: 3 }],
] as const;

describe('Stocktake server authorization and contract', () => {
  let app: INestApplication;
  let origin: string;
  beforeAll(async () => {
    app = await NestFactory.create(StocktakeHttpTestModule, { logger: false });
    app.setGlobalPrefix('api'); app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
    await app.listen(0, '127.0.0.1'); origin = await app.getUrl();
  });
  afterAll(async () => { await app?.close(); });
  beforeEach(() => { vi.clearAllMocks(); current = { ...staff, authenticatedAt: new Date() }; });
  const request = (method: string, path: string, body?: unknown, authenticated = true) => fetch(`${origin}/api/v1/stocktakes${path}`, {
    method, headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'stocktake-http-test',
      ...(authenticated ? { Authorization: 'Bearer isolated-test-token' } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  it.each(routes)('%s denies anonymous/customer/missing permission before executing the service', async (name, method, path, permission, body) => {
    expect(Reflect.getMetadata(REQUIRE_AUTH_LEVEL, StocktakeController)).toBe('STAFF_MFA');
    expect(Reflect.getMetadata(REQUIRE_PERMISSION, StocktakeController.prototype[name])).toBe(permission);
    expect((await request(method, path, body, false)).status).toBe(401);
    current = { ...staff, authenticationLevel: 'CUSTOMER_OTP' };
    expect((await request(method, path, body)).status).toBe(403);
    current = { ...staff, permissions: new Set() };
    expect((await request(method, path, body)).status).toBe(403);
    expect(service[name]).not.toHaveBeenCalled();
  });

  it('requires fresh MFA only for ledger approval and never trusts body actor/permission fields', async () => {
    expect(Reflect.getMetadata(REQUIRE_FRESH_AUTH, StocktakeController.prototype.approve)).toBe(true);
    current = { ...staff, authenticatedAt: new Date(Date.now() - 6 * 60_000) };
    const stale = await request('POST', '/session-id/approve', { expectedVersion: 3 });
    expect(stale.status).toBe(401);
    expect(await stale.json()).toMatchObject({ code: 'AUTH_REAUTHENTICATION_REQUIRED' });
    expect(service.approve).not.toHaveBeenCalled();
    expect((await request('POST', '/session-id/counts', { expectedVersion: 1, lines: [{ locationId: 'location', variantId: 'variant', countedQty: 0 }] })).status).toBe(201);
    current = staff;
    expect((await request('POST', '', { warehouseId: 'warehouse', actorId: 'other', canApprove: true })).status).toBe(400);
    expect(service.create).not.toHaveBeenCalled();
  });

  it('passes only the authenticated actor/current permission set to command projections', async () => {
    current = { ...staff, permissions: new Set(['stocktake.manage']) };
    expect((await request('POST', '', { warehouseId: 'warehouse' })).status).toBe(201);
    expect(service.create).toHaveBeenCalledWith(expect.objectContaining({ warehouseId: 'warehouse' }),
      expect.objectContaining({ actorId: staff.userId, canApprove: false, idempotencyKey: 'stocktake-http-test' }));
  });

  it.each([-1, 0.5, 2_147_483_648])('rejects invalid count %s before service execution', async countedQty => {
    expect((await request('POST', '/session-id/counts', { expectedVersion: 0,
      lines: [{ locationId: 'location', variantId: 'variant', countedQty }] })).status).toBe(400);
    expect(service.count).not.toHaveBeenCalled();
  });

  it('bounds pages, versions and scope identifiers', async () => {
    for (const query of ['?limit=101', '?offset=-1', '?limit=NaN', '/variants?limit=51']) {
      expect((await request('GET', query)).status).toBe(400);
    }
    expect((await request('POST', '/session-id/start', { expectedVersion: 2_147_483_648 })).status).toBe(400);
    expect((await request('POST', '', { warehouseId: 'warehouse', locationIds: ['x'.repeat(129)] })).status).toBe(400);
  });
});
