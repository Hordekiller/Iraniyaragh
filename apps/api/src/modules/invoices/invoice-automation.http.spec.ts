import 'reflect-metadata';
import { Module, VersioningType } from '@nestjs/common';
import { APP_GUARD, NestFactory, type INestApplication } from '@nestjs/core';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiFoundationModule } from '../../common/api-foundation.module';
import { AuditLogService } from '../audit/audit-log.service';
import { AuthGuard } from '../auth/auth.guard';
import { AuthPrincipalService, type AuthPrincipalContext } from '../auth/auth-principal.service';
import { AuthSessionException } from '../auth/auth-session.service';
import { InvoiceAutomationController } from './invoice-automation.controller';
import { INVOICE_AUTOMATION_PERMISSIONS, InvoiceAutomationService } from './invoice-automation.service';

const principal = (userId: string, level: 'CUSTOMER_OTP' | 'STAFF_MFA', permissions: string[], stale = false): AuthPrincipalContext => ({
  userId, sessionId: 'session', tokenId: 'token', authenticationLevel: level, permissions: new Set(permissions),
  authenticatedAt: new Date(Date.now() - (stale ? 600000 : 1000)), accessExpiresAt: new Date(Date.now() + 600000),
});
const everything = ['settings.manage', ...INVOICE_AUTOMATION_PERMISSIONS];
const principals = {
  owner: principal('owner', 'STAFF_MFA', everything),
  stale: principal('stale', 'STAFF_MFA', everything, true),
  // May manage settings but cannot issue or publish invoices personally.
  settingsOnly: principal('settings-only', 'STAFF_MFA', ['settings.manage']),
  missingPublish: principal('no-publish', 'STAFF_MFA', everything.filter(permission => permission !== 'invoices.publish')),
  invoiceClerk: principal('clerk', 'STAFF_MFA', [...INVOICE_AUTOMATION_PERMISSIONS]),
  customer: principal('customer', 'CUSTOMER_OTP', everything),
};
const resolver = { resolveBearerToken: vi.fn(async (authorization?: string) => {
  const token = authorization?.replace('Bearer ', '') as keyof typeof principals;
  if (token in principals) return principals[token];
  throw new AuthSessionException('AUTH_SESSION_INVALID');
}) };
const config = { enabled: true, version: 1, updatedAt: null, authorizedById: 'owner', policyReady: true, pendingOrders: 0, unpublishedInvoices: 0 };
const service = { readAdmin: vi.fn(async () => config), update: vi.fn(async () => config) };
@Module({ imports: [ApiFoundationModule], controllers: [InvoiceAutomationController], providers: [
  { provide: InvoiceAutomationService, useValue: service }, { provide: AuthPrincipalService, useValue: resolver },
  { provide: APP_GUARD, useValue: new AuthGuard(resolver as unknown as AuthPrincipalService, { record: vi.fn(async () => undefined) } as unknown as AuditLogService) },
] })
class TestModule {}

describe('invoice automation setting HTTP security', () => {
  let app: INestApplication; let origin: string;
  const call = (method: 'GET' | 'PUT', token?: string, body?: unknown) => fetch(`${origin}/api/v1/settings/admin/invoice-automation`, {
    method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body),
  });
  beforeAll(async () => {
    app = await NestFactory.create(TestModule, { logger: false }); app.setGlobalPrefix('api'); app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    await app.listen(0, '127.0.0.1'); origin = await app.getUrl();
  });
  beforeEach(() => vi.clearAllMocks());
  afterAll(async () => app.close());

  it('lets only staff with settings.manage read the setting, uncached', async () => {
    expect((await call('GET')).status).toBe(401);
    expect((await call('GET', 'customer')).status).toBe(403);
    expect((await call('GET', 'invoiceClerk')).status).toBe(403);
    expect(service.readAdmin).not.toHaveBeenCalled();
    const response = await call('GET', 'settingsOnly');
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(((await response.json()) as { data: { config: unknown } }).data.config).toEqual(config);
  });

  it('enables only for a freshly authenticated operator who may issue and publish personally', async () => {
    const body = { expectedVersion: 0, enabled: true };
    expect((await call('PUT', undefined, body)).status).toBe(401);
    expect((await call('PUT', 'customer', body)).status).toBe(403);
    expect((await call('PUT', 'invoiceClerk', body)).status).toBe(403);
    expect((await call('PUT', 'settingsOnly', body)).status).toBe(403);
    expect((await call('PUT', 'missingPublish', body)).status).toBe(403);
    const stale = await call('PUT', 'stale', body);
    expect(stale.status).toBe(401);
    expect(((await stale.json()) as { code: string }).code).toBe('AUTH_REAUTHENTICATION_REQUIRED');
    expect(service.update).not.toHaveBeenCalled();
    expect((await call('PUT', 'owner', body)).status).toBe(200);
    expect(service.update).toHaveBeenCalledWith('owner', expect.any(String), body);
  });

  it('lets a settings manager switch it off without invoice permissions, and rejects malformed bodies', async () => {
    expect((await call('PUT', 'settingsOnly', { expectedVersion: 1, enabled: false })).status).toBe(200);
    expect(service.update).toHaveBeenCalledWith('settings-only', expect.any(String), { expectedVersion: 1, enabled: false });
    vi.clearAllMocks();
    for (const bad of [{}, { enabled: true }, { expectedVersion: -1, enabled: true }, { expectedVersion: 1.5, enabled: true }, { expectedVersion: 0, enabled: 'yes' }, { expectedVersion: 0, enabled: true, actorId: 'spoof' }]) {
      expect((await call('PUT', 'owner', bad)).status, JSON.stringify(bad)).toBe(400);
    }
    expect(service.update).not.toHaveBeenCalled();
  });
});
