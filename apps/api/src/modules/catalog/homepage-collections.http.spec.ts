import 'reflect-metadata';
import { Module, VersioningType } from '@nestjs/common';
import { APP_GUARD, NestFactory, type INestApplication } from '@nestjs/core';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiFoundationModule } from '../../common/api-foundation.module';
import { AuditLogService } from '../audit/audit-log.service';
import { AuthGuard } from '../auth/auth.guard';
import { AuthPrincipalService, type AuthPrincipalContext } from '../auth/auth-principal.service';
import { AuthSessionException } from '../auth/auth-session.service';
import { HomepageCollectionsController } from './homepage-collections.controller';
import { HomepageCollectionsService } from './homepage-collections.service';

const principal = (level: 'CUSTOMER_OTP' | 'STAFF_MFA', permissions: string[], stale = false): AuthPrincipalContext => ({
  userId: 'operator', sessionId: 'session', tokenId: 'token', authenticationLevel: level, permissions: new Set(permissions),
  authenticatedAt: new Date(Date.now() - (stale ? 600000 : 1000)), accessExpiresAt: new Date(Date.now() + 600000),
});
const principals = { staff: principal('STAFF_MFA', ['settings.manage']), stale: principal('STAFF_MFA', ['settings.manage'], true), customer: principal('CUSTOMER_OTP', ['settings.manage']), reader: principal('STAFF_MFA', []) };
const resolver = { resolveBearerToken: vi.fn(async (authorization?: string) => {
  const token = authorization?.replace('Bearer ', '') as keyof typeof principals;
  if (token in principals) return principals[token];
  throw new AuthSessionException('AUTH_SESSION_INVALID');
}) };
const service = { read: vi.fn(async () => ({ version: 0, sections: [], updatedAt: null })), update: vi.fn(async () => ({ version: 1, sections: [], updatedAt: '2026-10-19T08:00:00Z' })) };
@Module({ imports: [ApiFoundationModule], controllers: [HomepageCollectionsController], providers: [
  { provide: HomepageCollectionsService, useValue: service }, { provide: AuthPrincipalService, useValue: resolver },
  { provide: APP_GUARD, useValue: new AuthGuard(resolver as unknown as AuthPrincipalService, { record: vi.fn(async () => undefined) } as unknown as AuditLogService) },
] })
class TestModule {}

describe('homepage collection settings HTTP security and contract', () => {
  let app: INestApplication; let origin: string;
  const body = { expectedVersion: 0, sections: Array.from({ length: 5 }, (_, index) => ({ categoryId: `root-${index}`, sortBy: index === 0 ? 'BESTSELLING' : 'NEWEST' })) };
  const call = (method: 'GET' | 'PUT', suffix: '' | '/admin', token?: string, input: unknown = body, key = 'homepage-key') => fetch(`${origin}/api/v1/catalog/homepage-collections${suffix}`, {
    method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json', ...(key ? { 'idempotency-key': key } : {}) }, body: method === 'PUT' ? JSON.stringify(input) : undefined,
  });
  beforeAll(async () => {
    app = await NestFactory.create(TestModule, { logger: false }); app.setGlobalPrefix('api'); app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    await app.listen(0, '127.0.0.1'); origin = await app.getUrl();
  });
  beforeEach(() => vi.clearAllMocks());
  afterAll(async () => app.close());

  it('allows a safe public projection and enforces STAFF_MFA plus settings.manage on admin routes', async () => {
    expect((await call('GET', '')).status).toBe(200);
    expect((await call('GET', '/admin')).status).toBe(401);
    expect((await call('GET', '/admin', 'customer')).status).toBe(403);
    expect((await call('GET', '/admin', 'reader')).status).toBe(403);
    expect((await call('PUT', '/admin')).status).toBe(401);
    expect((await call('PUT', '/admin', 'customer')).status).toBe(403);
    expect((await call('PUT', '/admin', 'reader')).status).toBe(403);
    expect(service.update).not.toHaveBeenCalled();
  });

  it('requires fresh MFA and a valid bounded section contract for writes', async () => {
    expect((await call('PUT', '/admin', 'stale')).status).toBe(401);
    expect((await call('PUT', '/admin', 'staff')).status).toBe(200);
    expect(service.update).toHaveBeenCalledWith('operator', expect.any(String), body, 'homepage-key');
    for (const invalid of [
      { ...body, actorId: 'spoofed' }, { ...body, sections: [] },
      { ...body, sections: Array.from({ length: 6 }, (_, index) => ({ categoryId: `c-${index}`, sortBy: 'NEWEST' })) },
      { ...body, sections: [{ categoryId: 'hinges', sortBy: 'reviews' }] }, { ...body, sections: [{ categoryId: 'hinges', sortBy: 'NEWEST', title: 'injected' }] },
    ]) expect((await call('PUT', '/admin', 'staff', invalid)).status).toBe(400);
    expect((await call('PUT', '/admin', 'staff', body, '')).status).toBe(400);
  });
});
