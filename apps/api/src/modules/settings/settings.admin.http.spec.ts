import 'reflect-metadata';

import { ConflictException, Module, ValidationPipe, VersioningType } from '@nestjs/common';
import { NestFactory, type INestApplication } from '@nestjs/core';
import { APP_GUARD, APP_PIPE } from '@nestjs/core';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiFoundationModule } from '../../common/api-foundation.module';
import { AuthSessionException } from '../auth/auth-session.service';
import { AuthGuard } from '../auth/auth.guard';
import { type AuthPrincipalContext, AuthPrincipalService } from '../auth/auth-principal.service';
import { SettingsAdminController } from './settings.admin.controller';
import { SettingsService } from './settings.service';

const freshStaffPrincipal: AuthPrincipalContext = Object.freeze({
  userId: 'staff-fresh',
  sessionId: 'session-fresh',
  tokenId: 'jti-fresh',
  authenticationLevel: 'STAFF_MFA',
  authenticatedAt: new Date(Date.now() - 30_000),
  accessExpiresAt: new Date(Date.now() + 600_000),
  permissions: new Set(['settings.manage']),
});

const noPermissionPrincipal: AuthPrincipalContext = Object.freeze({
  ...freshStaffPrincipal,
  userId: 'staff-no-permission',
  permissions: new Set(['catalog.read']),
});

const customerPrincipal: AuthPrincipalContext = Object.freeze({
  ...freshStaffPrincipal,
  userId: 'customer-1',
  authenticationLevel: 'CUSTOMER_OTP',
  permissions: new Set<string>(),
});

const staleStaffPrincipal: AuthPrincipalContext = Object.freeze({
  ...freshStaffPrincipal,
  userId: 'staff-stale',
  authenticatedAt: new Date(Date.now() - 6 * 60 * 1_000),
});

const principalService = {
  resolveBearerToken: vi.fn(async (authorization?: string): Promise<AuthPrincipalContext> => {
    if (authorization === 'Bearer staff-fresh') return freshStaffPrincipal;
    if (authorization === 'Bearer staff-no-permission') return noPermissionPrincipal;
    if (authorization === 'Bearer customer') return customerPrincipal;
    if (authorization === 'Bearer staff-stale') return staleStaffPrincipal;
    throw new AuthSessionException('AUTH_SESSION_INVALID');
  }),
};

const financialPolicyPayload = {
  expectedVersion: 0,
  value: {
    vatRateBp: 1000,
    vatTreatment: 'EXCLUSIVE',
    roundingMethod: 'ROUND_HALF_UP',
    maxDiscountOrderBp: 5000,
    discountApprovalThreshold: { amount: '5000000', currency: 'IRR' },
    refundAutoMax: { amount: '1000000', currency: 'IRR' },
    refundMaxFractionBp: 10000,
    withdrawalWindowDays: 7,
  },
};

const serviceFixtures = {
  getSnapshot: (version: number) => ({
    data: {
      settings: {
        financialPolicy: { key: 'financialPolicy', version, value: financialPolicyPayload.value },
        sellerLegalBlock: { key: 'sellerLegalBlock', version: 0, value: { legalName: '' } },
      },
    },
  }),
  financialPolicyEntry: (version: number) => ({
    data: { settings: { financialPolicy: { key: 'financialPolicy', version, value: financialPolicyPayload.value } } },
  }),
  sellerLegalBlockEntry: (version: number) => ({
    data: { settings: { sellerLegalBlock: { key: 'sellerLegalBlock', version, value: { legalName: 'Iraniyaragh Bookstore' } } } },
  }),
};

function createServiceStub() {
  return {
    getSnapshot: vi.fn(async () => serviceFixtures.getSnapshot(3)),
    updateFinancialPolicy: vi.fn(async (ctx: unknown, input: { expectedVersion: number }) =>
      input.expectedVersion !== 3
        ? Promise.reject(new ConflictException({ code: 'CONFLICT', message: 'The settings changed concurrently.' }))
        : serviceFixtures.financialPolicyEntry(4),
    ),
    updateSellerLegalBlock: vi.fn(async (ctx: unknown, input: { expectedVersion: number }) =>
      input.expectedVersion !== 3
        ? Promise.reject(new ConflictException({ code: 'CONFLICT', message: 'The settings changed concurrently.' }))
        : serviceFixtures.sellerLegalBlockEntry(2),
    ),
  } as unknown as SettingsService;
}

const serviceStub = createServiceStub();

@Module({
  imports: [ApiFoundationModule],
  controllers: [SettingsAdminController],
  providers: [
    { provide: SettingsService, useValue: serviceStub },
    { provide: AuthPrincipalService, useValue: principalService },
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    },
    { provide: APP_GUARD, useValue: new AuthGuard(principalService as unknown as AuthPrincipalService) },
  ],
})
// Route-level evidence harness (see notifications.admin.http.spec.ts). It boots a
// dedicated Nest test module importing ApiFoundationModule with a real AuthGuard
// over a stubbed AuthPrincipalService and SettingsService; it is NOT the real
// AppModule, so wiring beyond this controller is not exercised here.
class SettingsAdminHttpTestModule {}

describe('SettingsAdminController HTTP authorization', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    app = await NestFactory.create(SettingsAdminHttpTestModule, { logger: false });
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    await app.init();
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
  });

  beforeEach(() => {
    principalService.resolveBearerToken.mockClear();
    serviceStub.getSnapshot.mockClear();
    serviceStub.updateFinancialPolicy.mockClear();
    serviceStub.updateSellerLegalBlock.mockClear();
  });

  afterAll(async () => {
    await app.close();
  });

  const reads: ReadonlyArray<{ label: string; method: string; path: string }> = [
    { label: 'read the settings snapshot', method: 'GET', path: '/api/v1/settings/admin' },
  ];

  const mutations: ReadonlyArray<{ label: string; method: string; path: string; body?: object }> = [
    { label: 'update the financial policy', method: 'PUT', path: '/api/v1/settings/admin/financial-policy', body: { ...financialPolicyPayload, expectedVersion: 3 } },
    { label: 'update the seller legal block', method: 'PUT', path: '/api/v1/settings/admin/seller-legal-block', body: { expectedVersion: 3, value: { legalName: 'Iraniyaragh Bookstore' } } },
  ];

  it.each([...reads, ...mutations])('denies $label without credentials (401)', async ({ method, path, body }) => {
    const response = await fetch(baseUrl + path, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    expect(response.status).toBe(401);
    const responseBody = (await response.json()) as { code: string; requestId: string; statusCode: number };
    expect(responseBody).toMatchObject({ code: 'AUTH_SESSION_INVALID', statusCode: 401 });
    expect(response.headers.get('x-request-id')).toBeTruthy();
    expect(responseBody.requestId).toBe(response.headers.get('x-request-id'));
  });

  it.each([...reads, ...mutations])('denies $label with an invalid token (401)', async ({ method, path, body }) => {
    const response = await fetch(baseUrl + path, {
      method,
      headers: { authorization: 'Bearer garbage', 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ code: 'AUTH_SESSION_INVALID', statusCode: 401 });
  });

  it.each([...reads, ...mutations])('denies $label to a customer-level principal (403)', async ({ method, path, body }) => {
    const response = await fetch(baseUrl + path, {
      method,
      headers: { authorization: 'Bearer customer', 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: 'FORBIDDEN', statusCode: 403 });
  });

  it.each([...reads, ...mutations])('denies $label to staff without settings.manage (403)', async ({ method, path, body }) => {
    const response = await fetch(baseUrl + path, {
      method,
      headers: { authorization: 'Bearer staff-no-permission', 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: 'FORBIDDEN', statusCode: 403 });
  });

  it.each(mutations)('requires fresh authentication for $label (401)', async ({ method, path, body }) => {
    const response = await fetch(baseUrl + path, {
      method,
      headers: { authorization: 'Bearer staff-stale', 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      code: 'AUTH_REAUTHENTICATION_REQUIRED',
      statusCode: 401,
    });
  });

  it('admits the read for a stale staff principal because reads are not fresh-bound', async () => {
    const response = await fetch(baseUrl + '/api/v1/settings/admin', {
      headers: { authorization: 'Bearer staff-stale' },
    });
    expect(response.status).toBe(200);
    expect(serviceStub.getSnapshot).toHaveBeenCalledOnce();
  });

  it.each(mutations)('permits $label for fresh authorized staff', async ({ method, path, body }) => {
    const response = await fetch(baseUrl + path, {
      method,
      headers: { authorization: 'Bearer staff-fresh', 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    expect([200, 201]).toContain(response.status);
    expect(response.headers.get('x-request-id')).toBeTruthy();
  });

  it('returns the stable 409 CONFLICT envelope for a stale optimistic update', async () => {
    const response = await fetch(baseUrl + '/api/v1/settings/admin/financial-policy', {
      method: 'PUT',
      headers: { authorization: 'Bearer staff-fresh', 'content-type': 'application/json' },
      body: JSON.stringify({ ...financialPolicyPayload, expectedVersion: 2 }),
    });
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: 'CONFLICT', statusCode: 409 });
  });

  it('propagates the actor and request id into the service context', async () => {
    const response = await fetch(baseUrl + '/api/v1/settings/admin/seller-legal-block', {
      method: 'PUT',
      headers: { authorization: 'Bearer staff-fresh', 'content-type': 'application/json' },
      body: JSON.stringify({ expectedVersion: 3, value: { legalName: 'Iraniyaragh Bookstore' } }),
    });
    expect(response.status).toBe(200);
    const [context] = serviceStub.updateSellerLegalBlock.mock.calls[0] as [{ actorUserId: string; requestId: string }];
    expect(context).toMatchObject({ actorUserId: 'staff-fresh' });
    expect(context.requestId).toBeTruthy();
  });
});