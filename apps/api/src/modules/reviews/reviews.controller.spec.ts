import { describe, expect, it, vi } from 'vitest';
import type { AuthPrincipalContext } from '../auth/auth-principal.service';
import { ReviewsController } from './reviews.controller';
import type { ReviewsRateLimitService } from './reviews-rate-limit.service';
import type { ReviewsService } from './reviews.service';

const principal = { userId: 'u1' } as AuthPrincipalContext;
const body = { rating: 5, title: null, body: 'متن نظر برای آزمون' };

function setup() {
  const order: string[] = [];
  const service = {
    summaryItems: vi.fn(async () => [{ productId: 'a', average: 4, count: 2 }]),
    listPublic: vi.fn(async () => ({ items: [] })),
    eligibility: vi.fn(async () => ({ canReview: true })),
    create: vi.fn(async () => { order.push('create'); return { id: 'r1' }; }),
    updateOwn: vi.fn(async () => { order.push('update'); return { id: 'r1' }; }),
    listAdmin: vi.fn(async () => ({ items: [] })),
    getAdmin: vi.fn(async () => ({ id: 'r1' })),
    moderate: vi.fn(async () => ({ id: 'r1' })),
    reply: vi.fn(async () => ({ id: 'r1' })),
  };
  const limiter = { enforceWrite: vi.fn(async () => { order.push('limit'); }) };
  const controller = new ReviewsController(service as unknown as ReviewsService, limiter as unknown as ReviewsRateLimitService);
  return { service, limiter, controller, order };
}

describe('ReviewsController', () => {
  it('de-duplicates summary ids and rejects empty, oversized or malformed lists before the service', async () => {
    const t = setup();
    expect(await t.controller.summaries(' a, b ,a,')).toEqual({ data: { items: [{ productId: 'a', average: 4, count: 2 }] } });
    expect(t.service.summaryItems).toHaveBeenCalledWith(['a', 'b']);
    await expect(t.controller.summaries(undefined)).rejects.toMatchObject({ status: 400 });
    await expect(t.controller.summaries('ok,bad id!')).rejects.toMatchObject({ status: 400 });
    await expect(t.controller.summaries(Array.from({ length: 101 }, (_, i) => `p${i}`).join(','))).rejects.toMatchObject({ status: 400 });
    expect(t.service.summaryItems).toHaveBeenCalledTimes(1);
  });

  it('takes the customer identity from the session and applies the write limit before any write', async () => {
    const t = setup();
    expect(await t.controller.create(principal, { slug: 'hinge' }, 'key-1', body)).toEqual({ data: { review: { id: 'r1' } } });
    expect(t.service.create).toHaveBeenCalledWith('u1', 'no-request-id', 'hinge', body, 'key-1');
    await t.controller.update(principal, { id: 'r1' }, ' key-2 ', { ...body, expectedVersion: 3 });
    expect(t.service.updateOwn).toHaveBeenCalledWith('u1', 'no-request-id', 'r1', 3, expect.anything(), 'key-2');
    expect(t.order).toEqual(['limit', 'create', 'limit', 'update']);
  });

  it('does not write when the limiter refuses or the idempotency key is missing', async () => {
    const t = setup();
    t.limiter.enforceWrite.mockRejectedValueOnce(Object.assign(new Error('limited'), { status: 429 }));
    await expect(t.controller.create(principal, { slug: 'hinge' }, 'k', body)).rejects.toMatchObject({ status: 429 });
    await expect(t.controller.create(principal, { slug: 'hinge' }, undefined, body)).rejects.toMatchObject({ status: 400 });
    await expect(t.controller.update(principal, { id: 'r1' }, ' ', { ...body, expectedVersion: 1 })).rejects.toMatchObject({ status: 400 });
    expect(t.service.create).not.toHaveBeenCalled();
    expect(t.service.updateOwn).not.toHaveBeenCalled();
  });

  it('wraps public and eligibility reads', async () => {
    const t = setup();
    expect(await t.controller.list({ slug: 'hinge' }, { page: 2, sort: 'highest' })).toEqual({ data: { items: [] } });
    expect(t.service.listPublic).toHaveBeenCalledWith('hinge', 2, 'highest');
    expect(await t.controller.eligibility(principal, { slug: 'hinge' })).toEqual({ data: { canReview: true } });
    expect(t.service.eligibility).toHaveBeenCalledWith('u1', 'hinge');
  });

  it('passes staff filters through, trimming a blank search to none', async () => {
    const t = setup();
    await t.controller.adminList({ page: 1, q: '   ', status: 'PENDING', productId: 'p1', rating: 4 });
    expect(t.service.listAdmin).toHaveBeenCalledWith({ page: 1, status: 'PENDING', q: undefined, productId: 'p1', rating: 4 });
    await t.controller.adminList({ page: 1, q: ' لولا ' });
    expect(t.service.listAdmin).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'لولا' }));
    expect(await t.controller.adminRead({ id: 'r1' })).toEqual({ data: { review: { id: 'r1' } } });
  });

  it('records moderation and replies under the signed-in staff member with a validated key', async () => {
    const t = setup();
    const staff = { userId: 'staff1' } as AuthPrincipalContext;
    await t.controller.moderate(staff, { id: 'r1' }, 'k1', { action: 'approve', expectedVersion: 1, note: null });
    expect(t.service.moderate).toHaveBeenCalledWith('staff1', 'no-request-id', 'r1', { action: 'approve', expectedVersion: 1, note: null }, 'k1');
    await t.controller.reply(staff, { id: 'r1' }, 'k2', { expectedVersion: 2, reply: 'ممنون' });
    expect(t.service.reply).toHaveBeenCalledWith('staff1', 'no-request-id', 'r1', { expectedVersion: 2, reply: 'ممنون' }, 'k2');
    await expect(t.controller.moderate(staff, { id: 'r1' }, undefined, { action: 'hide', expectedVersion: 1, note: 'x' })).rejects.toMatchObject({ status: 400 });
    await expect(t.controller.reply(staff, { id: 'r1' }, '', { expectedVersion: 1, reply: null })).rejects.toMatchObject({ status: 400 });
    expect(t.service.moderate).toHaveBeenCalledTimes(1);
    expect(t.service.reply).toHaveBeenCalledTimes(1);
  });
});
