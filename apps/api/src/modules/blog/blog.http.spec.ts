import 'reflect-metadata';
import { Module, VersioningType } from '@nestjs/common';
import { APP_GUARD, NestFactory, type INestApplication } from '@nestjs/core';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiFoundationModule } from '../../common/api-foundation.module';
import { AuditLogService } from '../audit/audit-log.service';
import { AuthGuard } from '../auth/auth.guard';
import { AuthPrincipalService, type AuthPrincipalContext } from '../auth/auth-principal.service';
import { AuthSessionException } from '../auth/auth-session.service';
import { BlogController } from './blog.controller';
import { BlogService } from './blog.service';

const principal = (level: 'CUSTOMER_OTP' | 'STAFF_MFA', permissions: string[], stale = false): AuthPrincipalContext => ({
  userId: 'operator', sessionId: 'session', tokenId: 'token', authenticationLevel: level, permissions: new Set(permissions),
  authenticatedAt: new Date(Date.now() - (stale ? 600000 : 1000)), accessExpiresAt: new Date(Date.now() + 600000),
});
const principals = {
  writer: principal('STAFF_MFA', ['blog.read', 'blog.write']), reader: principal('STAFF_MFA', ['blog.read']), none: principal('STAFF_MFA', []),
  stale: principal('STAFF_MFA', ['blog.read', 'blog.write'], true), customer: principal('CUSTOMER_OTP', ['blog.read', 'blog.write']),
};
const resolver = { resolveBearerToken: vi.fn(async (authorization?: string) => {
  const token = authorization?.replace('Bearer ', '') as keyof typeof principals;
  if (token in principals) return principals[token];
  throw new AuthSessionException('AUTH_SESSION_INVALID');
}) };
const post = { id: 'p1', version: 1 };
const service = {
  listPublic: vi.fn(async () => ({ items: [], meta: { page: 1, pages: 1, total: 0, perPage: 12 } })), getPublic: vi.fn(async () => ({ post: null, redirectSlug: null })),
  listAdmin: vi.fn(async () => ({ items: [], meta: { page: 1, pages: 1, total: 0, perPage: 20 } })), getAdmin: vi.fn(async () => post), revisions: vi.fn(async () => []), mediaOptions: vi.fn(async () => []),
  create: vi.fn(async () => post), update: vi.fn(async () => post), transition: vi.fn(async () => post),
};
@Module({ imports: [ApiFoundationModule], controllers: [BlogController], providers: [
  { provide: BlogService, useValue: service }, { provide: AuthPrincipalService, useValue: resolver },
  { provide: APP_GUARD, useValue: new AuthGuard(resolver as unknown as AuthPrincipalService, { record: vi.fn(async () => undefined) } as unknown as AuditLogService) },
] })
class TestModule {}

const article = { slug: 'راهنما', title: 'عنوان', excerpt: 'خلاصه', bodyHtml: '<p>x</p>', coverMediaId: null, coverAlt: null, tags: [], seoTitle: null, seoDescription: null, sources: [] };

describe('blog HTTP security and contract', () => {
  let app: INestApplication; let origin: string;
  const call = (method: string, path: string, token?: string, input?: unknown, key: string | null = 'blog-key') => fetch(`${origin}/api/v1/blog${path}`, {
    method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json', ...(key ? { 'idempotency-key': key } : {}) }, body: input === undefined ? undefined : JSON.stringify(input),
  });
  beforeAll(async () => {
    app = await NestFactory.create(TestModule, { logger: false }); app.setGlobalPrefix('api'); app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    await app.listen(0, '127.0.0.1'); origin = await app.getUrl();
  });
  beforeEach(() => vi.clearAllMocks());
  afterAll(async () => app.close());

  it('serves public reads anonymously with a short shared cache and a bounded page parameter', async () => {
    const response = await call('GET', '/posts?page=2');
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('public');
    expect(service.listPublic).toHaveBeenCalledWith(2);
    for (const page of ['0', '-1', 'abc', '99999999']) expect((await call('GET', `/posts?page=${page}`)).status).toBe(400);
    expect((await call('GET', '/posts/slug')).status).toBe(200);
  });

  it('requires STAFF_MFA and the right blog permission on every admin route', async () => {
    for (const [method, path, input] of [['GET', '/admin/posts'], ['GET', '/admin/posts/p1'], ['GET', '/admin/posts/p1/revisions'], ['GET', '/admin/media-options'], ['POST', '/admin/posts', article], ['PUT', '/admin/posts/p1', { expectedVersion: 1, post: article }], ['POST', '/admin/posts/p1/transition', { action: 'submit', expectedVersion: 1 }]] as const) {
      expect((await call(method, path, undefined, input)).status, `${method} ${path} anonymous`).toBe(401);
      expect((await call(method, path, 'customer', input)).status, `${method} ${path} customer`).toBe(403);
      expect((await call(method, path, 'none', input)).status, `${method} ${path} no permission`).toBe(403);
    }
    expect((await call('POST', '/admin/posts', 'reader', article)).status).toBe(403);
    expect((await call('GET', '/admin/posts', 'reader')).status).toBe(200);
    expect(service.create).not.toHaveBeenCalled();
  });

  it('requires fresh MFA, an idempotency key and a strict body for writes', async () => {
    expect((await call('POST', '/admin/posts', 'stale', article)).status).toBe(401);
    expect((await call('POST', '/admin/posts', 'writer', article, null)).status).toBe(400);
    expect((await call('POST', '/admin/posts', 'writer', article)).status).toBe(201);
    expect(service.create).toHaveBeenCalledWith('operator', expect.any(String), expect.objectContaining({ slug: 'راهنما' }), 'blog-key');
    for (const invalid of [{ ...article, authorId: 'spoofed' }, { ...article, status: 'PUBLISHED' }, { ...article, tags: Array.from({ length: 9 }, () => 't') }, { ...article, sources: [{ title: 'x', url: 'u', accessedAt: '2026-01-01', extra: 1 }] }]) {
      expect((await call('POST', '/admin/posts', 'writer', invalid)).status).toBe(400);
    }
    expect(service.create).toHaveBeenCalledTimes(1);
  });

  it('validates transition actions and forwards the actor permissions to the service', async () => {
    expect((await call('POST', '/admin/posts/p1/transition', 'writer', { action: 'delete', expectedVersion: 1 })).status).toBe(400);
    expect((await call('POST', '/admin/posts/p1/transition', 'writer', { action: 'submit', expectedVersion: 0 })).status).toBe(400);
    expect((await call('POST', '/admin/posts/p1/transition', 'writer', { action: 'submit', expectedVersion: 1 })).status).toBe(201);
    expect(service.transition).toHaveBeenCalledWith('operator', principals.writer.permissions, expect.any(String), 'p1', expect.objectContaining({ action: 'submit' }), 'blog-key');
    expect((await call('GET', '/admin/posts/bad%20id', 'reader')).status).toBe(400);
  });
});
