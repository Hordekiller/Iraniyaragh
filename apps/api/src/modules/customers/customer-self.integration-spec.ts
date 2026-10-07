import 'reflect-metadata';
import { randomInt, randomUUID } from 'node:crypto';
import { Module, ValidationPipe, VersioningType, type INestApplication } from '@nestjs/common';
import { APP_GUARD, NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiFoundationModule } from '../../common/api-foundation.module';
import { PrismaService } from '../../database/prisma.service';
import { assertIsolatedTestDatabase } from '../../test/database-url.guard';
import { AuditLogService } from '../audit/audit-log.service';
import type { AuthRuntimeConfig } from '../auth/auth.config';
import { AuthGuard } from '../auth/auth.guard';
import { AuthHashService } from '../auth/auth-hash.service';
import { AuthPermissionService } from '../auth/auth-permission.service';
import { AuthPrincipalService } from '../auth/auth-principal.service';
import { AuthSessionService } from '../auth/auth-session.service';
import { AuthTokenService } from '../auth/auth-token.service';
import { CustomerSelfController } from './customer-self.controller';
import { CustomerAccountAddressesDto, CustomerUpdateDto } from './customers.dto';
import { CustomersService } from './customers.service';

// Only disposable PostgreSQL: setup provisions two synthetic identities and
// sessions through the real session service. It does not accept an SMS provider
// or replace authentication, the principal resolver, authorization or mutations.
const runId = randomUUID();
const config: AuthRuntimeConfig = {
  accessSigningSecret: randomUUID() + randomUUID(), issuer: `customer-self-it-${runId}`,
  audience: 'iranyaragh-browser', accessTokenTtlSeconds: 600, clockToleranceSeconds: 30,
  currentHashKey: { version: 1, secret: randomUUID() + randomUUID() },
  cookies: { refreshName: '__Host-iranyaragh_refresh', csrfName: '__Host-iranyaragh_csrf', secure: true, sameSite: 'strict', path: '/' },
};
const prisma = new PrismaService();
const audit = new AuditLogService(prisma);
const customers = new CustomersService(prisma, audit);
const tokens = new AuthTokenService(config);
const sessions = new AuthSessionService(prisma, new AuthHashService(config), tokens);
const principal = new AuthPrincipalService(prisma, tokens, new AuthPermissionService(prisma));
// esbuild omits design metadata; these are the production tsc constructor/body
// types. The actual auth metadata and guards remain untouched.
Reflect.defineMetadata('design:paramtypes', [CustomersService], CustomerSelfController);
Reflect.defineMetadata('design:paramtypes', [Object, String, CustomerUpdateDto], CustomerSelfController.prototype, 'update');
Reflect.defineMetadata('design:paramtypes', [Object, String, CustomerAccountAddressesDto], CustomerSelfController.prototype, 'replaceAddresses');
@Module({ imports: [ApiFoundationModule], controllers: [CustomerSelfController], providers: [
  { provide: CustomersService, useValue: customers },
  { provide: APP_GUARD, useValue: new AuthGuard(principal, audit) },
] })
class CustomerSelfIntegrationModule {}

describe.sequential('Customer-self real HTTP/session/PostgreSQL security', () => {
  const users = [`self-a-${runId}`, `self-b-${runId}`];
  const mobiles = [0, 1].map(index => `+989${randomInt(100_000_000, 899_999_999) + index}`);
  const ids: string[] = [];
  const access: string[] = [];
  let app: INestApplication;
  let origin: string;
  let foreignBefore: unknown;
  let orderId: string;
  let connected = false;
  const request = (method: string, path = '', body?: unknown, token = access[0], key = `self-${randomUUID()}`) =>
    fetch(`${origin}/api/v1/customers/me${path}`, {
      method, headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const account = async () => (await (await request('GET')).json()).data.account;
  const address = (label: string, isDefault = true) => ({ label, receiverName: 'مشتری آزمایشی', mobile: mobiles[0], provinceCode: 'THR', city: 'تهران', addressLine: 'نشانی مصنوعی تست', isDefault });
  const foreignState = () => prisma.customer.findUniqueOrThrow({ where: { id: ids[1] }, include: { addresses: true, notes: true } });

  beforeAll(async () => {
    assertIsolatedTestDatabase({ databaseUrl: process.env.DATABASE_URL, nodeEnvironment: process.env.NODE_ENV });
    await prisma.$connect();
    connected = true;
    for (const [index, id] of users.entries()) {
      await prisma.user.create({ data: { id, mobile: mobiles[index], status: 'ACTIVE', createdAt: new Date(Date.now() - 60000), isMobileVerified: true, mobileVerifiedAt: new Date() } });
      const row = await prisma.customer.create({ data: { userId: id, mobile: mobiles[index], firstName: index ? 'مشتری ب' : 'مشتری الف' } });
      ids.push(row.id);
      access.push((await sessions.createSession({ userId: id, authenticationLevel: 'CUSTOMER_OTP', authenticatedAt: new Date(Date.now() - 1000) })).accessToken);
    }
    await prisma.customerAddress.create({ data: { customerId: ids[1], ...address('فقط مشتری ب'), mobile: mobiles[1] } });
    await prisma.customerNote.create({ data: { customerId: ids[1], createdById: users[0], visibility: 'INTERNAL', body: 'internal-test-marker' } });
    foreignBefore = await foreignState();
    app = await NestFactory.create(CustomerSelfIntegrationModule, { logger: false });
    app.setGlobalPrefix('api'); app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
    await app.listen(0, '127.0.0.1'); origin = await app.getUrl();
  });
  afterAll(async () => {
    if (!connected) return;
    await app?.close();
    await prisma.auditLog.deleteMany({ where: { actorId: { in: users } } });
    await prisma.customerCommandRecord.deleteMany({ where: { actorId: { in: users } } });
    if (orderId) await prisma.order.deleteMany({ where: { id: orderId } });
    await prisma.customer.deleteMany({ where: { id: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.$disconnect();
  });

  it('denies anonymous reads and mutations', async () => {
    for (const [method, path, body] of [['GET', '', undefined], ['PATCH', '', { expectedVersion: 0, firstName: 'x' }], ['PUT', '/addresses', { expectedVersion: 0, addresses: [] }]] as const)
      expect((await request(method, path, body, '')).status).toBe(401);
  });
  it('reads only the principal account even with foreign query IDs and exposes no staff data', async () => {
    const response = await request('GET', `?customerId=${ids[1]}&userId=${users[1]}`);
    expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('no-store');
    const own = (await response.json()).data.account;
    expect(own.id).toBe(ids[0]); expect(own.addresses).toEqual([]);
    expect(Object.keys(own).sort()).toEqual(['addresses', 'firstName', 'id', 'lastName', 'mobile', 'version']);
    expect(JSON.stringify(own)).not.toContain('internal-test-marker');
    const second = (await (await request('GET', '', undefined, access[1])).json()).data.account;
    expect(second.id).toBe(ids[1]); expect(second.addresses).toHaveLength(1);
    expect(Object.keys(second).sort()).toEqual(Object.keys(own).sort());
    expect(JSON.stringify(second)).not.toContain('internal-test-marker');
  });
  it('cannot address another customer or address through URL or body identifiers', async () => {
    const foreign = await foreignState();
    for (const [method, path] of [['GET', `/${ids[1]}`], ['PATCH', `/${ids[1]}`], ['DELETE', `/addresses/${foreign.addresses[0].id}`], ['PUT', `/addresses/${foreign.addresses[0].id}`]])
      expect((await request(method, path, method === 'GET' ? undefined : { expectedVersion: 0, addresses: [] })).status).toBe(404);
    for (const injected of [{ customerId: ids[1] }, { userId: users[1] }, { mobile: mobiles[1] }, { status: 'INACTIVE' }])
      expect((await request('PATCH', '', { expectedVersion: 0, firstName: 'x', ...injected })).status).toBe(400);
    expect((await request('PUT', '/addresses', { expectedVersion: 0, addresses: [{ ...address('injected'), id: foreign.addresses[0].id, customerId: ids[1] }] })).status).toBe(400);
    expect(await foreignState()).toEqual(foreignBefore);
  });
  it('replays profile submissions once, rejects conflicting payloads and stale versions', async () => {
    const before = await account(); const key = `self-profile-${runId}`;
    const input = { expectedVersion: before.version, firstName: 'نام آزمایشی جدید' };
    const path = `?customerId=${ids[1]}&userId=${users[1]}`;
    const responses = await Promise.all([request('PATCH', path, input, access[0], key), request('PATCH', path, input, access[0], key)]);
    expect(responses.map(response => response.status)).toEqual([200, 200]);
    expect((await account()).version).toBe(before.version + 1);
    expect(await prisma.auditLog.count({ where: { actorId: users[0], action: 'customer.updated' } })).toBe(1);
    expect((await request('PATCH', '', { ...input, firstName: 'payload changed' }, access[0], key)).status).toBe(409);
    expect((await request('PATCH', '', { ...input, firstName: 'stale' })).status).toBe(409);
    expect(await foreignState()).toEqual(foreignBefore);
  });
  it('accepts contract-defined nullable names, including blank-name clearing, and replays once', async () => {
    const before = await account();
    const input = { expectedVersion: before.version, firstName: null, lastName: '   ' };
    const key = `self-clear-names-${runId}`;
    const first = await request('PATCH', '', input, access[0], key);
    expect(first.status).toBe(200);
    const firstBody = await first.json();
    expect(firstBody.data.account).toMatchObject({ firstName: null, lastName: null, version: before.version + 1 });
    const replay = await request('PATCH', '', input, access[0], key);
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual(firstBody);
    expect((await account()).version).toBe(before.version + 1);
    const invalid = await request('PATCH', '', { expectedVersion: before.version + 1, firstName: 42 });
    expect(invalid.status).toBe(400);
    expect((await account()).version).toBe(before.version + 1);
    expect(await foreignState()).toEqual(foreignBefore);
  });
  it('allows exactly one concurrent profile version winner', async () => {
    const before = await account();
    const responses = await Promise.all(['one', 'two'].map(lastName => request('PATCH', '', { expectedVersion: before.version, lastName })));
    expect(responses.map(response => response.status).sort()).toEqual([200, 409]);
    expect((await account()).version).toBe(before.version + 1);
    expect(await foreignState()).toEqual(foreignBefore);
  });
  it('creates, edits, changes default and deletes only own addresses; retries preserve IDs and order snapshots', async () => {
    const before = await account(); const key = `self-address-${runId}`;
    const input = { expectedVersion: before.version, addresses: [address('خانه'), address('دفتر', false)] };
    expect((await request('PUT', '/addresses', input, access[0], key)).status).toBe(200);
    let saved = await account(); const firstIds = saved.addresses.map((value: { id: string }) => value.id).sort();
    expect((await request('PUT', '/addresses', input, access[0], key)).status).toBe(200);
    expect((await account()).addresses.map((value: { id: string }) => value.id).sort()).toEqual(firstIds);
    expect(saved.addresses.filter((value: { isDefault: boolean }) => value.isDefault)).toHaveLength(1);
    const snapshot = { provinceCode: 'THR', city: 'تهران', address: 'نشانی ثابت آزمایشی', postalCode: '1234567890', recipient: 'تست', mobile: mobiles[0] };
    orderId = `self-order-${runId}`;
    await prisma.order.create({ data: { id: orderId, number: orderId, customerId: ids[0], subtotal: 0n, shipping: 0n, grandTotal: 0n, addressSnapshot: snapshot, shippingMethod: 'TEST', shippingMethodTitle: 'test', shippingPolicyRevision: 'test', pricePolicyRevision: 'test', reservationExpiresAt: new Date(Date.now() + 60000) } });
    expect((await request('PUT', '/addresses', { expectedVersion: saved.version, addresses: [address('خانه ویرایش‌شده', false), address('دفتر پیش‌فرض')] })).status).toBe(200);
    saved = await account(); expect(saved.addresses.find((value: { isDefault: boolean }) => value.isDefault).label).toBe('دفتر پیش‌فرض');
    expect((await request('PUT', '/addresses', { expectedVersion: before.version, addresses: [] })).status).toBe(409);
    const deletionKey = `self-delete-${runId}`; const deletion = { expectedVersion: saved.version, addresses: [] };
    expect((await request('PUT', '/addresses', deletion, access[0], deletionKey)).status).toBe(200);
    expect((await request('PUT', '/addresses', deletion, access[0], deletionKey)).status).toBe(200);
    expect((await account()).addresses).toEqual([]);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).addressSnapshot).toEqual(snapshot);
    expect(await foreignState()).toEqual(foreignBefore);
    const logs = await prisma.auditLog.findMany({ where: { actorId: users[0], entityType: 'Customer' }, select: { metadata: true } });
    for (const sensitive of [mobiles[0], 'نشانی مصنوعی تست', 'مشتری آزمایشی', 'نام آزمایشی جدید']) expect(JSON.stringify(logs)).not.toContain(sensitive);
  });
  it('rejects zero or multiple defaults transactionally and keeps the current version', async () => {
    const before = await account();
    for (const addresses of [[address('no default', false)], [address('one'), address('two')]])
      expect((await request('PUT', '/addresses', { expectedVersion: before.version, addresses })).status).toBe(400);
    expect(await account()).toEqual(before);
  });
  it('denies expired, revoked and wrong-level sessions for reads and mutations', async () => {
    for (const condition of ['expired', 'revoked', 'staff'] as const) {
      const issued = await sessions.createSession({ userId: users[0], authenticationLevel: condition === 'staff' ? 'STAFF_MFA' : 'CUSTOMER_OTP', authenticatedAt: new Date(Date.now() - 60000) });
      if (condition !== 'staff') await prisma.session.update({ where: { id: issued.sessionId }, data: condition === 'expired'
        ? { createdAt: new Date(Date.now() - 30000), lastUsedAt: new Date(Date.now() - 10000), expiresAt: new Date(Date.now() - 1000) }
        : { revokedAt: new Date(), revokeReason: 'REVOKED' } });
      for (const [method, path, body] of [['GET', '', undefined], ['PATCH', '', { expectedVersion: 0, firstName: 'x' }], ['PUT', '/addresses', { expectedVersion: 0, addresses: [] }]] as const)
        expect((await request(method, path, body, issued.accessToken)).status).toBe(condition === 'staff' ? 403 : 401);
    }
    expect(await foreignState()).toEqual(foreignBefore);
  });
});
