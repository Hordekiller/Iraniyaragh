import 'reflect-metadata';
import { Module, VersioningType } from '@nestjs/common';
import { APP_GUARD, NestFactory, type INestApplication } from '@nestjs/core';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiFoundationModule } from '../../common/api-foundation.module';
import { AuditLogService } from '../audit/audit-log.service';
import { AuthGuard } from '../auth/auth.guard';
import { AuthPrincipalService, type AuthPrincipalContext } from '../auth/auth-principal.service';
import { AuthSessionException } from '../auth/auth-session.service';
import { InvoicePdfCapacityController } from './invoice-pdf-capacity.controller';
import { InvoicePdfCapacityService } from './invoice-pdf-capacity.service';

const principal = (userId: string, level: 'CUSTOMER_OTP' | 'STAFF_MFA', permissions: string[], stale = false): AuthPrincipalContext => ({
  userId, sessionId: 'session', tokenId: 'token', authenticationLevel: level, permissions: new Set(permissions),
  authenticatedAt: new Date(Date.now() - (stale ? 600000 : 1000)), accessExpiresAt: new Date(Date.now() + 600000),
});
const principals = {
  owner: principal('owner', 'STAFF_MFA', ['settings.manage']),
  stale: principal('stale', 'STAFF_MFA', ['settings.manage'], true),
  invoiceClerk: principal('clerk', 'STAFF_MFA', ['invoices.read', 'invoices.manage', 'invoices.issue', 'invoices.publish']),
  customer: principal('customer', 'CUSTOMER_OTP', ['settings.manage']),
};
const resolver = { resolveBearerToken: vi.fn(async (authorization?: string) => {
  const token = authorization?.replace('Bearer ', '') as keyof typeof principals;
  if (token in principals) return principals[token];
  throw new AuthSessionException('AUTH_SESSION_INVALID');
}) };
const capacity = { configured: true, enabled: true, version: 1, budgetMegabytes: 64, maxArtifacts: 500, maxPendingJobs: 3, storedBytes: 0, artifactCount: 0, pendingJobCount: 0 };
const service = { read: vi.fn(async () => capacity), update: vi.fn(async () => capacity) };
@Module({ imports: [ApiFoundationModule], controllers: [InvoicePdfCapacityController], providers: [
  { provide: InvoicePdfCapacityService, useValue: service }, { provide: AuthPrincipalService, useValue: resolver },
  { provide: APP_GUARD, useValue: new AuthGuard(resolver as unknown as AuthPrincipalService, { record: vi.fn(async () => undefined) } as unknown as AuditLogService) },
] })
class TestModule {}

describe('invoice PDF capacity setting HTTP security', () => {
  let app: INestApplication; let origin: string;
  const call = (method: 'GET' | 'PUT', token?: string, body?: unknown) => fetch(`${origin}/api/v1/settings/admin/invoice-pdf-capacity`, {
    method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body),
  });
  const body = { expectedVersion: 0, enabled: true, budgetMegabytes: 64, maxArtifacts: 500, maxPendingJobs: 3 };
  beforeAll(async () => {
    app = await NestFactory.create(TestModule, { logger: false }); app.setGlobalPrefix('api'); app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    await app.listen(0, '127.0.0.1'); origin = await app.getUrl();
  });
  beforeEach(() => vi.clearAllMocks());
  afterAll(async () => app.close());

  it('lets only staff with settings.manage read the capacity, uncached', async () => {
    expect((await call('GET')).status).toBe(401);
    expect((await call('GET', 'customer')).status).toBe(403);
    expect((await call('GET', 'invoiceClerk')).status).toBe(403);
    expect(service.read).not.toHaveBeenCalled();
    const response = await call('GET', 'owner');
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(((await response.json()) as { data: { capacity: unknown } }).data.capacity).toEqual(capacity);
  });

  it('approves capacity only for a freshly authenticated settings manager', async () => {
    expect((await call('PUT', undefined, body)).status).toBe(401);
    expect((await call('PUT', 'customer', body)).status).toBe(403);
    expect((await call('PUT', 'invoiceClerk', body)).status).toBe(403);
    const stale = await call('PUT', 'stale', body);
    expect(stale.status).toBe(401);
    expect(((await stale.json()) as { code: string }).code).toBe('AUTH_REAUTHENTICATION_REQUIRED');
    expect(service.update).not.toHaveBeenCalled();
    expect((await call('PUT', 'owner', body)).status).toBe(200);
    expect(service.update).toHaveBeenCalledWith('owner', expect.any(String), body);
  });

  it('rejects malformed, out-of-range and spoofed bodies before the service', async () => {
    for (const bad of [{}, { ...body, expectedVersion: -1 }, { ...body, enabled: 'yes' }, { ...body, budgetMegabytes: 0 }, { ...body, budgetMegabytes: 1025 },
      { ...body, budgetMegabytes: 1.5 }, { ...body, maxArtifacts: 0 }, { ...body, maxArtifacts: 20001 }, { ...body, maxPendingJobs: 0 }, { ...body, maxPendingJobs: 21 },
      { ...body, storedBytes: 0 }, { ...body, actorId: 'spoof' }]) {
      expect((await call('PUT', 'owner', bad)).status, JSON.stringify(bad)).toBe(400);
    }
    expect(service.update).not.toHaveBeenCalled();
  });
});
