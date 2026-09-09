import 'reflect-metadata';

import { Module, UnprocessableEntityException, ValidationPipe, VersioningType } from '@nestjs/common';
import { NestFactory, type INestApplication } from '@nestjs/core';
import { APP_GUARD } from '@nestjs/core';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiFoundationModule } from '../../common/api-foundation.module';
import { AuthSessionException } from '../auth/auth-session.service';
import { AuthGuard } from '../auth/auth.guard';
import { type AuthPrincipalContext, AuthPrincipalService } from '../auth/auth-principal.service';
import { NotificationsAdminController } from './notifications.admin.controller';
import { SmsSettingsService } from './sms-settings.service';

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

function createServiceStub() {
  const unconfirmed = () => {
    throw new UnprocessableEntityException({ code: 'UNPROCESSABLE', message: 'Explicit confirmation is required.' });
  };
  return {
    getSettings: vi.fn(async () => ({ data: { snapshot: { version: 3 } } })),
    updateSettings: vi.fn(async () => ({ data: { snapshot: { version: 4 } } })),
    rotateSecret: vi.fn(async (ctx: unknown, input: { confirm: boolean }) =>
      input.confirm === true
        ? { data: { snapshot: { version: 5 } } }
        : unconfirmed(),
    ),
    clearSecret: vi.fn(async (ctx: unknown, input: { confirm: boolean }) =>
      input.confirm === true
        ? { data: { snapshot: { version: 6 } } }
        : unconfirmed(),
    ),
    validateConfiguration: vi.fn(async () => ({
      data: { validation: { checked: true, providerHealth: 'ok', errorClass: null, lastCheckedAt: '' } },
    })),
    sendControlledTest: vi.fn(async (ctx: unknown, input: { confirm: boolean }) =>
      input.confirm === true
        ? { data: { outcome: { status: 'accepted', messageId: 'msg-1' } } }
        : unconfirmed(),
    ),
    getDiagnostics: vi.fn(async () => ({
      data: {
        diagnostics: {
          providerHealth: 'ok',
          circuitState: 'closed',
          lastSuccessfulSendAt: '',
          lastErrorClass: null,
        },
      },
    })),
  } as unknown as SmsSettingsService;
}

const serviceStub = createServiceStub();

@Module({
  imports: [ApiFoundationModule],
  controllers: [NotificationsAdminController],
  providers: [
    { provide: SmsSettingsService, useValue: serviceStub },
    { provide: AuthPrincipalService, useValue: principalService },
    { provide: APP_GUARD, useValue: new AuthGuard(principalService as unknown as AuthPrincipalService) },
  ],
})
class NotificationsAdminHttpTestModule {}

describe('NotificationsAdminController HTTP authorization', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    app = await NestFactory.create(NotificationsAdminHttpTestModule, { logger: false });
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
  });

  beforeEach(() => {
    principalService.resolveBearerToken.mockClear();
    serviceStub.getSettings.mockClear();
    serviceStub.updateSettings.mockClear();
    serviceStub.rotateSecret.mockClear();
    serviceStub.clearSecret.mockClear();
    serviceStub.validateConfiguration.mockClear();
    serviceStub.sendControlledTest.mockClear();
    serviceStub.getDiagnostics.mockClear();
  });

  afterAll(async () => {
    await app.close();
  });

  const mutations: ReadonlyArray<{ label: string; method: string; path: string; body?: object }> = [
    { label: 'update settings', method: 'PUT', path: '/api/v1/notifications/admin/sms-settings', body: { expectedVersion: 3, patch: { enabled: true } } },
    { label: 'rotate secret', method: 'POST', path: '/api/v1/notifications/admin/sms-settings/secret', body: { secret: '0123456789abcdef', confirm: true, idempotencyKey: 'rotate-http-1' } },
    { label: 'clear secret', method: 'DELETE', path: '/api/v1/notifications/admin/sms-settings/secret', body: { confirm: true, idempotencyKey: 'clear-http-1' } },
    { label: 'validate configuration', method: 'POST', path: '/api/v1/notifications/admin/sms-settings/validate' },
    { label: 'send controlled test', method: 'POST', path: '/api/v1/notifications/admin/sms-settings/test-send', body: { confirm: true, idempotencyKey: 'test-http-1' } },
  ];

  it.each(mutations)('denies $label without credentials (401)', async ({ method, path, body }) => {
    const response = await fetch(baseUrl + path, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    expect(response.status).toBe(401);
    const responseBody = (await response.json()) as { code: string; requestId: string; statusCode: number };
    expect(responseBody).toMatchObject({ code: 'AUTH_SESSION_INVALID', statusCode: 401 });
    expect(response.headers.get('x-request-id')).toBeTruthy();
    expect(responseBody.requestId).toBe(response.headers.get('x-request-id'));
  });

  it.each(mutations)('denies $label with an invalid token (401)', async ({ method, path, body }) => {
    const response = await fetch(baseUrl + path, {
      method,
      headers: { authorization: 'Bearer garbage', 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ code: 'AUTH_SESSION_INVALID', statusCode: 401 });
  });

  it.each(mutations)('denies $label to a customer-level principal (403)', async ({ method, path, body }) => {
    const response = await fetch(baseUrl + path, {
      method,
      headers: { authorization: 'Bearer customer', 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: 'FORBIDDEN', statusCode: 403 });
  });

  it.each(mutations)('denies $label to staff without settings.manage (403)', async ({ method, path, body }) => {
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

  it.each(mutations)('permits $label for fresh authorized staff', async ({ method, path, body }) => {
    const response = await fetch(baseUrl + path, {
      method,
      headers: { authorization: 'Bearer staff-fresh', 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    expect([200, 201]).toContain(response.status);
    expect(response.headers.get('x-request-id')).toBeTruthy();
  });

  it('denies the header read without credentials (401)', async () => {
    const response = await fetch(baseUrl + '/api/v1/notifications/admin/sms-settings');
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ code: 'AUTH_SESSION_INVALID', statusCode: 401 });
  });

  it('denies the diagnostics read to customers (403) and admits stale staff because reads are not fresh-bound', async () => {
    const denied = await fetch(baseUrl + '/api/v1/notifications/admin/sms-settings/diagnostics', {
      headers: { authorization: 'Bearer customer' },
    });
    expect(denied.status).toBe(403);
    await expect(denied.json()).resolves.toMatchObject({ code: 'FORBIDDEN', statusCode: 403 });

    const admitted = await fetch(baseUrl + '/api/v1/notifications/admin/sms-settings/diagnostics', {
      headers: { authorization: 'Bearer staff-stale' },
    });
    expect(admitted.status).toBe(200);
  });

  it('admits the settings read for fresh authorized staff and passes the request through', async () => {
    const response = await fetch(baseUrl + '/api/v1/notifications/admin/sms-settings', {
      headers: { authorization: 'Bearer staff-fresh' },
    });
    expect(response.status).toBe(200);
    expect(serviceStub.getSettings).toHaveBeenCalledOnce();
  });

  it('returns the stable UNPROCESSABLE envelope when the confirmed operation is rejected by the service', async () => {
    const response = await fetch(baseUrl + '/api/v1/notifications/admin/sms-settings/secret', {
      method: 'POST',
      headers: { authorization: 'Bearer staff-fresh', 'content-type': 'application/json' },
      body: JSON.stringify({ secret: '0123456789abcdef', confirm: false, idempotencyKey: 'rotate-http-2' }),
    });
    expect(response.status).toBe(422);
    const body = (await response.json()) as { code: string; statusCode: number };
    expect(body).toMatchObject({ code: 'UNPROCESSABLE', statusCode: 422 });
  });

  it('keeps level checks ahead of the freshness check on mutation routes', async () => {
    const response = await fetch(baseUrl + '/api/v1/notifications/admin/sms-settings/test-send', {
      method: 'POST',
      headers: { authorization: 'Bearer customer', 'content-type': 'application/json' },
      body: JSON.stringify({ confirm: true, idempotencyKey: 'test-http-2' }),
    });
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: 'FORBIDDEN', statusCode: 403 });
  });
});