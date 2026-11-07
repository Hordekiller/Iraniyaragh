import 'reflect-metadata';
import { HttpException, Module, VersioningType } from '@nestjs/common';
import { APP_GUARD, NestFactory, type INestApplication } from '@nestjs/core';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiFoundationModule } from '../../common/api-foundation.module';
import { AuditLogService } from '../audit/audit-log.service';
import { AuthGuard } from '../auth/auth.guard';
import { AuthPrincipalService, type AuthPrincipalContext } from '../auth/auth-principal.service';
import { AuthSessionException } from '../auth/auth-session.service';
import { ReviewsController } from './reviews.controller';
import { ReviewsRateLimitService } from './reviews-rate-limit.service';
import { ReviewsService } from './reviews.service';

const principal = (userId: string, level: 'CUSTOMER_OTP' | 'STAFF_MFA', permissions: string[], stale = false): AuthPrincipalContext => ({
  userId, sessionId: 'session', tokenId: 'token', authenticationLevel: level, permissions: new Set(permissions),
  authenticatedAt: new Date(Date.now() - (stale ? 600000 : 1000)), accessExpiresAt: new Date(Date.now() + 600000),
});
const principals = {
  customer: principal('customer-user', 'CUSTOMER_OTP', []),
  moderator: principal('moderator', 'STAFF_MFA', ['reviews.read', 'reviews.moderate']),
  reader: principal('reader', 'STAFF_MFA', ['reviews.read']),
  none: principal('nobody', 'STAFF_MFA', []),
  stale: principal('stale', 'STAFF_MFA', ['reviews.read', 'reviews.moderate'], true),
  // A customer session never gains staff rights, even if permissions were somehow attached.
  customerWithStaffPerms: principal('customer-user', 'CUSTOMER_OTP', ['reviews.read', 'reviews.moderate']),
};
const resolver = { resolveBearerToken: vi.fn(async (authorization?: string) => {
  const token = authorization?.replace('Bearer ', '') as keyof typeof principals;
  if (token in principals) return principals[token];
  throw new AuthSessionException('AUTH_SESSION_INVALID');
}) };
const own = { id: 'r1', version: 1 };
const service = {
  summaryItems: vi.fn(async () => []), listPublic: vi.fn(async () => ({ items: [] })), eligibility: vi.fn(async () => ({ canReview: false })),
  create: vi.fn(async () => own), updateOwn: vi.fn(async () => own),
  listAdmin: vi.fn(async () => ({ items: [] })), getAdmin: vi.fn(async () => own), moderate: vi.fn(async () => own), reply: vi.fn(async () => own),
};
const limiter = { enforceWrite: vi.fn(async () => undefined) };
@Module({ imports: [ApiFoundationModule], controllers: [ReviewsController], providers: [
  { provide: ReviewsService, useValue: service }, { provide: ReviewsRateLimitService, useValue: limiter }, { provide: AuthPrincipalService, useValue: resolver },
  { provide: APP_GUARD, useValue: new AuthGuard(resolver as unknown as AuthPrincipalService, { record: vi.fn(async () => undefined) } as unknown as AuditLogService) },
] })
class TestModule {}

const input = { rating: 5, title: null, body: 'کیفیت عالی و ارسال سریع' };

describe('reviews HTTP security and contract', () => {
  let app: INestApplication; let origin: string;
  const call = (method: string, path: string, token?: string, body?: unknown, key: string | null = 'review-key') => fetch(`${origin}/api/v1/reviews${path}`, {
    method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json', ...(key ? { 'idempotency-key': key } : {}) }, body: body === undefined ? undefined : JSON.stringify(body),
  });
  beforeAll(async () => {
    app = await NestFactory.create(TestModule, { logger: false }); app.setGlobalPrefix('api'); app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    await app.listen(0, '127.0.0.1'); origin = await app.getUrl();
  });
  beforeEach(() => vi.clearAllMocks());
  afterAll(async () => app.close());

  it('serves approved-only public reads anonymously and bounds ids and paging', async () => {
    expect((await call('GET', '/products/drill')).status).toBe(200);
    expect((await call('GET', '/summaries?ids=a,b')).status).toBe(200);
    expect(service.summaryItems).toHaveBeenCalledWith(['a', 'b']);
    for (const bad of ['', '?ids=', `?ids=${Array.from({ length: 101 }, (_, i) => `p${i}`).join(',')}`, '?ids=bad id']) expect((await call('GET', `/summaries${bad}`)).status, bad).toBe(400);
    for (const page of ['0', 'abc', '999999999']) expect((await call('GET', `/products/drill?page=${page}`)).status).toBe(400);
  });

  it('requires an authenticated customer session for eligibility and writes', async () => {
    for (const [method, path, body] of [['GET', '/products/drill/me'], ['POST', '/products/drill', input], ['PUT', '/mine/r1', { ...input, expectedVersion: 1 }]] as const) {
      expect((await call(method, path, undefined, body)).status, `${method} ${path} anonymous`).toBe(401);
      expect((await call(method, path, 'moderator', body)).status, `${method} ${path} staff session`).toBe(403);
    }
    expect(service.eligibility).not.toHaveBeenCalled();
    expect(service.create).not.toHaveBeenCalled();
    expect(service.updateOwn).not.toHaveBeenCalled();
  });

  it('derives ownership from the session and rejects client-supplied identity or status', async () => {
    expect((await call('POST', '/products/drill', 'customer', input)).status).toBe(201);
    expect(service.create).toHaveBeenCalledWith('customer-user', expect.any(String), 'drill', expect.objectContaining({ rating: 5 }), 'review-key');
    expect(limiter.enforceWrite).toHaveBeenCalledWith('customer-user');
    for (const extra of [{ customerId: 'other' }, { status: 'APPROVED' }, { orderId: 'o1' }, { productId: 'p' }]) {
      expect((await call('POST', '/products/drill', 'customer', { ...input, ...extra })).status).toBe(400);
    }
    expect((await call('POST', '/products/drill', 'customer', { ...input, rating: 6 })).status).toBe(400);
    expect((await call('POST', '/products/drill', 'customer', input, null)).status).toBe(400);
    expect((await call('PUT', '/mine/r1', 'customer', { ...input, expectedVersion: 0 })).status).toBe(400);
    expect((await call('PUT', '/mine/r1', 'customer', { ...input, expectedVersion: 1 })).status).toBe(200);
    expect(service.updateOwn).toHaveBeenCalledWith('customer-user', expect.any(String), 'r1', 1, expect.objectContaining({ rating: 5 }), 'review-key');
    expect(service.create).toHaveBeenCalledTimes(1);
  });

  it('does not run a write when the rate limit refuses it', async () => {
    limiter.enforceWrite.mockRejectedValueOnce(new HttpException({ code: 'RATE_LIMITED' }, 429));
    expect((await call('POST', '/products/drill', 'customer', input)).status).toBe(429);
    expect(service.create).not.toHaveBeenCalled();
  });

  it('requires STAFF_MFA and the right review permission on every admin route', async () => {
    const moderation = { action: 'approve', expectedVersion: 1, note: null };
    for (const [method, path, body] of [['GET', '/admin'], ['GET', '/admin/r1'], ['POST', '/admin/r1/moderate', moderation], ['POST', '/admin/r1/reply', { expectedVersion: 1, reply: 'ممنون' }]] as const) {
      expect((await call(method, path, undefined, body)).status, `${method} ${path} anonymous`).toBe(401);
      expect((await call(method, path, 'customer', body)).status, `${method} ${path} customer`).toBe(403);
      expect((await call(method, path, 'customerWithStaffPerms', body)).status, `${method} ${path} customer session with staff permissions`).toBe(403);
      expect((await call(method, path, 'none', body)).status, `${method} ${path} no permission`).toBe(403);
    }
    expect((await call('POST', '/admin/r1/moderate', 'reader', moderation)).status).toBe(403);
    expect((await call('POST', '/admin/r1/reply', 'reader', { expectedVersion: 1, reply: 'x' })).status).toBe(403);
    expect((await call('GET', '/admin', 'reader')).status).toBe(200);
    expect(service.moderate).not.toHaveBeenCalled();
    expect(service.reply).not.toHaveBeenCalled();
  });

  it('requires fresh MFA, an idempotency key and strict bodies for moderation', async () => {
    const moderation = { action: 'approve', expectedVersion: 1, note: null };
    expect((await call('POST', '/admin/r1/moderate', 'stale', moderation)).status).toBe(401);
    expect((await call('POST', '/admin/r1/moderate', 'moderator', moderation, null)).status).toBe(400);
    expect((await call('POST', '/admin/r1/moderate', 'moderator', { ...moderation, action: 'delete' })).status).toBe(400);
    expect((await call('POST', '/admin/r1/moderate', 'moderator', { ...moderation, status: 'APPROVED' })).status).toBe(400);
    expect((await call('POST', '/admin/r1/moderate', 'moderator', moderation)).status).toBe(201);
    expect(service.moderate).toHaveBeenCalledWith('moderator', expect.any(String), 'r1', expect.objectContaining({ action: 'approve', expectedVersion: 1 }), 'review-key');
    expect(service.moderate).toHaveBeenCalledTimes(1);
    expect((await call('GET', '/admin/bad%20id', 'reader')).status).toBe(400);
  });
});
