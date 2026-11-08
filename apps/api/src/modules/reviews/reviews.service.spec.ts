import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../database/prisma.service';
import type { AuditLogService } from '../audit/audit-log.service';
import { MODERATION, ReviewsService, summarize } from './reviews.service';

type Row = Record<string, unknown>;
const NOW = new Date('2026-11-01T10:00:00.000Z');
const input = { rating: 5, title: 'عالی', body: 'کیفیت لولا و نصب آن بسیار خوب بود.' };

const reviewRow = (over: Row = {}): Row => ({
  id: 'r1', productId: 'p1', customerId: 'c1', orderId: 'o1', rating: 5, title: 'عالی', body: input.body, status: 'PENDING', version: 1,
  moderationNote: null, moderatedById: null, moderatedAt: null, staffReply: null, staffRepliedById: null, staffRepliedAt: null,
  publishedAt: null, createdAt: NOW, updatedAt: NOW, ...over,
});
const adminRow = (over: Row = {}): Row => ({
  ...reviewRow(), product: { name: 'لولا', slug: 'hinge' }, customer: { firstName: 'احمد', lastName: 'رضایی', mobile: '+989120000000', userId: 'u1' },
  moderatedBy: null, staffRepliedBy: null, ...over,
});
const known = (code: string, target?: string[]) => new Prisma.PrismaClientKnownRequestError('x', { code, clientVersion: 'test', meta: target ? { target } : undefined });

function setup() {
  const db = {
    product: { findFirst: vi.fn(async (): Promise<Row | null> => ({ id: 'p1' })) },
    customer: { findUnique: vi.fn(async (): Promise<Row | null> => ({ id: 'c1', status: 'ACTIVE' })) },
    order: { findFirst: vi.fn(async (): Promise<Row | null> => ({ id: 'o1' })) },
    user: { findMany: vi.fn(async () => [{ id: 'mod1' }, { id: 'mod2' }]) },
    inAppNotification: { createMany: vi.fn(async () => ({ count: 1 })) },
    productReview: {
      groupBy: vi.fn(async (): Promise<Row[]> => []), findMany: vi.fn(async (): Promise<Row[]> => []), findUnique: vi.fn(async (): Promise<Row | null> => null),
      findFirst: vi.fn(async (): Promise<Row | null> => null), count: vi.fn(async () => 0), create: vi.fn(async ({ data }: { data: Row }) => reviewRow(data)),
      update: vi.fn(async (): Promise<Row> => adminRow()),
    },
    productReviewCommand: { findUnique: vi.fn(async (): Promise<Row | null> => null), create: vi.fn(async () => ({})) },
  };
  const prisma = { ...db, $transaction: vi.fn(async (work: (tx: typeof db) => unknown) => work(db)) };
  const audit = { record: vi.fn(async () => undefined) };
  return { db, prisma, audit, service: new ReviewsService(prisma as unknown as PrismaService, audit as unknown as AuditLogService) };
}

describe('summarize', () => {
  it('builds the distribution, rounds the average to one decimal and ignores out-of-range ratings', () => {
    expect(summarize([[5, 2], [4, 1], [1, 1]])).toEqual({ count: 4, average: 3.8, counts: [1, 0, 0, 1, 2] });
    expect(summarize([[9, 3], [0, 1]])).toEqual({ count: 0, average: null, counts: [0, 0, 0, 0, 0] });
    expect(summarize([])).toMatchObject({ count: 0, average: null });
  });
  it('allows only the documented moderation edges', () => {
    expect(MODERATION.approve.from).toEqual(['PENDING', 'REJECTED', 'HIDDEN']);
    expect(MODERATION.reject.from).toEqual(['PENDING']);
    expect(MODERATION.hide.from).toEqual(['APPROVED']);
  });
});

describe('public reads', () => {
  let t: ReturnType<typeof setup>;
  beforeEach(() => { t = setup(); });

  it('aggregates approved reviews of active products only and omits products without reviews', async () => {
    t.db.productReview.groupBy.mockResolvedValue([{ productId: 'a', rating: 5, _count: { _all: 2 } }, { productId: 'a', rating: 3, _count: { _all: 1 } }, { productId: 'b', rating: 4, _count: { _all: 1 } }]);
    expect(await t.service.summaryItems(['a', 'b', 'c'])).toEqual([{ productId: 'a', average: 4.3, count: 3 }, { productId: 'b', average: 4, count: 1 }]);
    expect(t.db.productReview.groupBy).toHaveBeenCalledWith(expect.objectContaining({ where: { productId: { in: ['a', 'b', 'c'] }, status: 'APPROVED', product: { status: 'ACTIVE' } } }));
    expect(await t.service.summaryItems([])).toEqual([]);
    expect(t.db.productReview.groupBy).toHaveBeenCalledTimes(1);
  });

  it('lists approved reviews with only public author fields and consistent paging', async () => {
    t.db.productReview.groupBy.mockResolvedValue([{ rating: 5, _count: { _all: 11 } }]);
    t.db.productReview.findMany.mockResolvedValue([reviewRow({ status: 'APPROVED', publishedAt: NOW, staffReply: 'ممنون', staffRepliedAt: NOW, customer: { firstName: 'احمد', lastName: 'رضایی' }, moderationNote: 'internal', orderId: 'secret-order' })]);
    const result = await t.service.listPublic('hinge', 2, 'highest');
    expect(result.meta).toEqual({ page: 2, pages: 2, total: 11, perPage: 10 });
    expect(result.summary).toMatchObject({ count: 11, average: 5 });
    expect(result.items[0]).toEqual({ id: 'r1', rating: 5, title: 'عالی', body: input.body, authorName: 'احمد ر.', verifiedPurchase: true, publishedAt: NOW.toISOString(), staffReply: 'ممنون', staffRepliedAt: NOW.toISOString() });
    expect(t.db.productReview.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 10, take: 10, where: { productId: 'p1', status: 'APPROVED' }, orderBy: [{ rating: 'desc' }, { publishedAt: 'desc' }, { id: 'desc' }] }));
    await t.service.listPublic('hinge', 1, 'lowest');
    expect(t.db.productReview.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ orderBy: [{ rating: 'asc' }, { publishedAt: 'desc' }, { id: 'desc' }] }));
    await t.service.listPublic('hinge', 1, 'newest');
    expect(t.db.productReview.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }] }));
  });

  it('answers 404 for an unknown or inactive product and shows an empty list as one page', async () => {
    t.db.product.findFirst.mockResolvedValueOnce(null);
    await expect(t.service.listPublic('gone', 1, 'newest')).rejects.toMatchObject({ status: 404 });
    expect((await t.service.listPublic('hinge', 1, 'newest')).meta).toMatchObject({ pages: 1, total: 0 });
    expect(t.db.product.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { slug: 'gone', status: 'ACTIVE' } }));
  });
});

describe('customer eligibility', () => {
  let t: ReturnType<typeof setup>;
  beforeEach(() => { t = setup(); });

  it('is eligible only with a DELIVERED order of that customer containing the product', async () => {
    expect(await t.service.eligibility('u1', 'hinge')).toEqual({ canReview: true, reason: 'ELIGIBLE', review: null });
    expect(t.db.order.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { customerId: 'c1', fulfillment: { is: { status: 'DELIVERED' } }, items: { some: { variant: { productId: 'p1' } } } } }));
    t.db.order.findFirst.mockResolvedValue(null);
    expect(await t.service.eligibility('u1', 'hinge')).toEqual({ canReview: false, reason: 'NOT_PURCHASED', review: null });
  });

  it('shows an existing review to its author, with the moderation note only for rejected or hidden ones', async () => {
    t.db.productReview.findUnique.mockResolvedValue(reviewRow({ status: 'REJECTED', moderationNote: 'نامرتبط' }));
    expect((await t.service.eligibility('u1', 'hinge')).review).toMatchObject({ status: 'REJECTED', moderationNote: 'نامرتبط' });
    t.db.productReview.findUnique.mockResolvedValue(reviewRow({ status: 'PENDING', moderationNote: 'stale note' }));
    expect(await t.service.eligibility('u1', 'hinge')).toMatchObject({ canReview: false, reason: 'ALREADY_REVIEWED', review: { moderationNote: null } });
    expect(t.db.order.findFirst).not.toHaveBeenCalled();
  });

  it('refuses sessions without an active customer account', async () => {
    t.db.customer.findUnique.mockResolvedValueOnce(null);
    await expect(t.service.eligibility('u1', 'hinge')).rejects.toMatchObject({ status: 403 });
    t.db.customer.findUnique.mockResolvedValueOnce({ id: 'c1', status: 'INACTIVE' });
    await expect(t.service.create('u1', 'req', 'hinge', input, 'k')).rejects.toMatchObject({ status: 403 });
  });
});

describe('create', () => {
  let t: ReturnType<typeof setup>;
  beforeEach(() => { t = setup(); });

  it('stores a PENDING review tied to the delivered order, alerts moderators once and audits without review text', async () => {
    const own = await t.service.create('u1', 'req', 'hinge', { ...input, body: `  ${input.body}  ` }, 'key-1');
    expect(own).toMatchObject({ status: 'PENDING', version: 1, rating: 5, moderationNote: null });
    expect(t.db.productReview.create).toHaveBeenCalledWith({ data: { productId: 'p1', customerId: 'c1', orderId: 'o1', rating: 5, title: 'عالی', body: input.body } });
    expect(t.db.inAppNotification.createMany).toHaveBeenCalledWith(expect.objectContaining({ skipDuplicates: true, data: [expect.objectContaining({ userId: 'mod1', audience: 'STAFF', dedupKey: 'review:r1:1:staff' }), expect.objectContaining({ userId: 'mod2' })] }));
    expect(t.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'review.created', actorId: 'u1', after: { productId: 'p1', rating: 5, status: 'PENDING' } }), expect.anything());
    expect(JSON.stringify(t.audit.record.mock.calls)).not.toContain('کیفیت');
    expect(t.db.productReviewCommand.create).toHaveBeenCalledWith({ data: expect.objectContaining({ actorId: 'u1', payloadHash: expect.stringMatching(/^[0-9a-f]{64}$/u) }) });
  });

  it('rejects invalid text before touching the database', async () => {
    await expect(t.service.create('u1', 'req', 'hinge', { ...input, body: '<script>x</script> متن طولانی کافی' }, 'k')).rejects.toMatchObject({ status: 400 });
    expect(t.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuses non-buyers, unknown products and a second review without writing', async () => {
    t.db.order.findFirst.mockResolvedValue(null);
    await expect(t.service.create('u1', 'req', 'hinge', input, 'k1')).rejects.toMatchObject({ status: 403, response: { code: 'REVIEW_NOT_ELIGIBLE' } });
    t.db.product.findFirst.mockResolvedValue(null);
    await expect(t.service.create('u1', 'req', 'gone', input, 'k2')).rejects.toMatchObject({ status: 404 });
    t.db.product.findFirst.mockResolvedValue({ id: 'p1' });
    t.db.productReview.findUnique.mockResolvedValue({ id: 'r1' });
    await expect(t.service.create('u1', 'req', 'hinge', input, 'k3')).rejects.toMatchObject({ status: 409, response: { code: 'ALREADY_REVIEWED' } });
    expect(t.db.productReview.create).not.toHaveBeenCalled();
    expect(t.db.productReviewCommand.create).not.toHaveBeenCalled();
  });

  it('replays the stored result for the same key and payload, and conflicts for a different payload', async () => {
    await t.service.create('u1', 'req', 'hinge', input, 'same-key');
    const stored = t.db.productReviewCommand.create.mock.calls[0]![0].data as Row;
    t.db.productReviewCommand.findUnique.mockResolvedValue(stored);
    t.db.productReview.create.mockClear();
    expect(await t.service.create('u1', 'req', 'hinge', input, 'same-key')).toEqual(stored.response);
    expect(t.db.productReview.create).not.toHaveBeenCalled();
    await expect(t.service.create('u1', 'req', 'hinge', { ...input, rating: 2 }, 'same-key')).rejects.toMatchObject({ status: 409, response: { code: 'IDEMPOTENCY_CONFLICT' } });
  });

  it('classifies database races: serialization failure, duplicate review, and a racing retry of the same key', async () => {
    t.prisma.$transaction.mockRejectedValueOnce(known('P2034'));
    await expect(t.service.create('u1', 'req', 'hinge', input, 'a')).rejects.toMatchObject({ status: 409, response: { code: 'CONCURRENT_UPDATE' } });
    t.prisma.$transaction.mockRejectedValueOnce(known('P2002', ['productId', 'customerId']));
    await expect(t.service.create('u1', 'req', 'hinge', input, 'b')).rejects.toMatchObject({ status: 409, response: { code: 'ALREADY_REVIEWED' } });

    // The key collision: another request with the same key committed first.
    await t.service.create('u1', 'req', 'hinge', input, 'race');
    const winner = t.db.productReviewCommand.create.mock.calls[0]![0].data as Row;
    t.prisma.$transaction.mockRejectedValueOnce(known('P2002', ['actorId', 'keyHash']));
    t.db.productReviewCommand.findUnique.mockResolvedValueOnce(winner);
    expect(await t.service.create('u1', 'req', 'hinge', input, 'race')).toEqual(winner.response);
    t.prisma.$transaction.mockRejectedValueOnce(known('P2002', ['actorId', 'keyHash']));
    t.db.productReviewCommand.findUnique.mockResolvedValueOnce({ ...winner, payloadHash: 'f'.repeat(64) });
    await expect(t.service.create('u1', 'req', 'hinge', input, 'race')).rejects.toMatchObject({ response: { code: 'IDEMPOTENCY_CONFLICT' } });
    // A key collision whose winner cannot be read is a retryable conflict, never a success.
    t.prisma.$transaction.mockRejectedValueOnce(known('P2002', ['actorId', 'keyHash']));
    await expect(t.service.create('u1', 'req', 'hinge', input, 'race')).rejects.toMatchObject({ response: { code: 'CONCURRENT_UPDATE' } });
  });

  it('does not disguise unknown failures as success or as a duplicate', async () => {
    t.prisma.$transaction.mockRejectedValueOnce(known('P2002', ['somethingElse']));
    await expect(t.service.create('u1', 'req', 'hinge', input, 'c')).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    t.prisma.$transaction.mockRejectedValueOnce(new Error('connection lost'));
    await expect(t.service.create('u1', 'req', 'hinge', input, 'd')).rejects.toThrow('connection lost');
  });

  it('skips moderator alerts when no active moderator exists', async () => {
    t.db.user.findMany.mockResolvedValue([]);
    await t.service.create('u1', 'req', 'hinge', input, 'k');
    expect(t.db.inAppNotification.createMany).not.toHaveBeenCalled();
  });
});

describe('author edits', () => {
  let t: ReturnType<typeof setup>;
  beforeEach(() => { t = setup(); });
  const edit = { rating: 3, title: null, body: 'پس از چند ماه استفاده نظرم کمی تغییر کرد.' };

  it('returns an approved review to moderation and drops the reply, notes and moderator', async () => {
    t.db.productReview.findFirst.mockResolvedValue(reviewRow({ status: 'APPROVED', version: 4, staffReply: 'پاسخ' }));
    t.db.productReview.update.mockResolvedValue(reviewRow({ ...edit, status: 'PENDING', version: 5 }));
    const own = await t.service.updateOwn('u1', 'req', 'r1', 4, edit, 'k');
    expect(own).toMatchObject({ status: 'PENDING', version: 5 });
    expect(t.db.productReview.findFirst).toHaveBeenCalledWith({ where: { id: 'r1', customerId: 'c1' } });
    expect(t.db.productReview.update).toHaveBeenCalledWith({ where: { id: 'r1' }, data: expect.objectContaining({ status: 'PENDING', version: { increment: 1 }, staffReply: null, staffRepliedById: null, moderationNote: null, moderatedById: null }) });
    expect(t.db.inAppNotification.createMany).toHaveBeenCalled();
    expect(t.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'review.edited', before: { status: 'APPROVED', rating: 5, version: 4 } }), expect.anything());
  });

  it("hides other customers' reviews, enforces the version and keeps hidden reviews staff-only", async () => {
    await expect(t.service.updateOwn('u1', 'req', 'r1', 1, edit, 'k1')).rejects.toMatchObject({ status: 404 });
    t.db.productReview.findFirst.mockResolvedValue(reviewRow({ version: 2 }));
    await expect(t.service.updateOwn('u1', 'req', 'r1', 1, edit, 'k2')).rejects.toMatchObject({ response: { code: 'STALE_VERSION' } });
    t.db.productReview.findFirst.mockResolvedValue(reviewRow({ status: 'HIDDEN' }));
    await expect(t.service.updateOwn('u1', 'req', 'r1', 1, edit, 'k3')).rejects.toMatchObject({ status: 403 });
    expect(t.db.productReview.update).not.toHaveBeenCalled();
  });
});

describe('staff reads', () => {
  let t: ReturnType<typeof setup>;
  beforeEach(() => { t = setup(); });

  it('projects admin rows with names, falling back to the mobile only for staff', async () => {
    t.db.productReview.findMany.mockResolvedValue([adminRow({ status: 'APPROVED', publishedAt: NOW, moderatedAt: NOW, moderatedBy: { firstName: 'مدیر', lastName: 'نظرات' }, customer: { firstName: null, lastName: null, mobile: '+989120000000', userId: 'u1' } })]);
    t.db.productReview.count.mockResolvedValueOnce(12).mockResolvedValueOnce(3);
    const list = await t.service.listAdmin({ page: 2, status: 'APPROVED', q: 'لولا', productId: 'p1', rating: 5 });
    expect(list).toMatchObject({ pending: 3, meta: { page: 2, pages: 2, total: 12, perPage: 10 } });
    expect(list.items[0]).toMatchObject({ customerName: '+989120000000', moderatedByName: 'مدیر نظرات', publishedAt: NOW.toISOString(), productSlug: 'hinge' });
    expect(t.db.productReview.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 10, where: expect.objectContaining({ status: 'APPROVED', productId: 'p1', rating: 5, OR: expect.any(Array) }) }));
    expect(t.db.productReview.count).toHaveBeenNthCalledWith(2, { where: { status: 'PENDING' } });
  });

  it('reads one review or answers 404', async () => {
    await expect(t.service.getAdmin('missing')).rejects.toMatchObject({ status: 404 });
    t.db.productReview.findUnique.mockResolvedValue(adminRow());
    expect(await t.service.getAdmin('r1')).toMatchObject({ id: 'r1', customerName: 'احمد رضایی', staffReply: null });
  });
});

describe('moderation and replies', () => {
  let t: ReturnType<typeof setup>;
  beforeEach(() => { t = setup(); });
  const request = (action: 'approve' | 'reject' | 'hide', expectedVersion = 1, note: string | null = null) => ({ action, expectedVersion, note });

  it('approves a pending review once: first publication time, customer notice and audit', async () => {
    t.db.productReview.findUnique.mockResolvedValue(reviewRow());
    t.db.productReview.update.mockResolvedValue(adminRow({ status: 'APPROVED', version: 2, publishedAt: NOW }));
    const result = await t.service.moderate('staff', 'req', 'r1', request('approve'), 'k');
    expect(result).toMatchObject({ status: 'APPROVED', version: 2 });
    const data = t.db.productReview.update.mock.calls[0]![0].data as Row;
    expect(data).toMatchObject({ status: 'APPROVED', version: { increment: 1 }, moderatedById: 'staff', publishedAt: expect.any(Date) });
    expect(data).not.toHaveProperty('staffReply');
    expect(t.db.inAppNotification.createMany).toHaveBeenCalledWith({ data: [expect.objectContaining({ userId: 'u1', audience: 'CUSTOMER', kind: 'REVIEW_APPROVED', dedupKey: 'review:r1:2:customer', href: '/products/hinge#reviews' })], skipDuplicates: true });
    expect(t.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'review.approve', actorId: 'staff', before: { status: 'PENDING', version: 1 } }), expect.anything());
  });

  it('keeps the original publication time when a hidden review is approved again', async () => {
    const first = new Date('2026-10-01T00:00:00.000Z');
    t.db.productReview.findUnique.mockResolvedValue(reviewRow({ status: 'HIDDEN', publishedAt: first }));
    t.db.productReview.update.mockResolvedValue(adminRow({ status: 'APPROVED', publishedAt: first, version: 2 }));
    await t.service.moderate('staff', 'req', 'r1', request('approve'), 'k');
    expect((t.db.productReview.update.mock.calls[0]![0].data as Row).publishedAt).toBe(first);
  });

  it('requires a reason to reject or hide, clears the reply when leaving public view and tells the author why', async () => {
    await expect(t.service.moderate('staff', 'req', 'r1', request('reject', 1, ' '), 'k')).rejects.toMatchObject({ status: 400 });
    await expect(t.service.moderate('staff', 'req', 'r1', request('hide', 1, null), 'k')).rejects.toMatchObject({ status: 400 });
    t.db.productReview.findUnique.mockResolvedValue(reviewRow({ status: 'APPROVED', staffReply: 'پاسخ', publishedAt: NOW }));
    t.db.productReview.update.mockResolvedValue(adminRow({ status: 'HIDDEN', version: 2 }));
    await t.service.moderate('staff', 'req', 'r1', request('hide', 1, 'محتوای نامناسب'), 'k');
    expect(t.db.productReview.update.mock.calls[0]![0].data).toMatchObject({ status: 'HIDDEN', moderationNote: 'محتوای نامناسب', staffReply: null, staffRepliedAt: null, staffRepliedById: null });
    expect(t.db.inAppNotification.createMany).toHaveBeenCalledWith({ data: [expect.objectContaining({ kind: 'REVIEW_HIDDEN', body: 'نظر شما از نمایش خارج شد: محتوای نامناسب' })], skipDuplicates: true });
  });

  it('refuses unknown, stale and disallowed transitions without writing', async () => {
    await expect(t.service.moderate('staff', 'req', 'nope', request('approve'), 'k1')).rejects.toMatchObject({ status: 404 });
    t.db.productReview.findUnique.mockResolvedValue(reviewRow({ version: 3 }));
    await expect(t.service.moderate('staff', 'req', 'r1', request('approve', 2), 'k2')).rejects.toMatchObject({ response: { code: 'STALE_VERSION' } });
    t.db.productReview.findUnique.mockResolvedValue(reviewRow({ status: 'APPROVED' }));
    await expect(t.service.moderate('staff', 'req', 'r1', request('approve'), 'k3')).rejects.toMatchObject({ response: { code: 'INVALID_TRANSITION' } });
    await expect(t.service.moderate('staff', 'req', 'r1', request('reject', 1, 'دلیل کافی'), 'k4')).rejects.toMatchObject({ response: { code: 'INVALID_TRANSITION' } });
    await expect(t.service.moderate('staff', 'req', 'r1', { action: 'delete' as 'hide', expectedVersion: 1, note: 'x' }, 'k5')).rejects.toMatchObject({ status: 400 });
    expect(t.db.productReview.update).not.toHaveBeenCalled();
    expect(t.db.productReviewCommand.create).not.toHaveBeenCalled();
  });

  it('does not notify an author who has no linked account', async () => {
    t.db.productReview.findUnique.mockResolvedValue(reviewRow());
    t.db.productReview.update.mockResolvedValue(adminRow({ status: 'APPROVED', version: 2, publishedAt: NOW, customer: { firstName: 'a', lastName: 'b', mobile: 'm', userId: null } }));
    await t.service.moderate('staff', 'req', 'r1', request('approve'), 'k');
    expect(t.db.inAppNotification.createMany).not.toHaveBeenCalled();
  });

  it('replies only to published reviews, can remove a reply and notifies only for a new reply', async () => {
    t.db.productReview.findUnique.mockResolvedValue(reviewRow({ status: 'PENDING' }));
    await expect(t.service.reply('staff', 'req', 'r1', { expectedVersion: 1, reply: 'ممنون' }, 'k1')).rejects.toMatchObject({ response: { code: 'INVALID_TRANSITION' } });
    t.db.productReview.findUnique.mockResolvedValue(reviewRow({ status: 'APPROVED', version: 2 }));
    await expect(t.service.reply('staff', 'req', 'r1', { expectedVersion: 1, reply: 'ممنون' }, 'k2')).rejects.toMatchObject({ response: { code: 'STALE_VERSION' } });
    await expect(t.service.reply('staff', 'req', 'r1', { expectedVersion: 2, reply: '<b>x</b>' }, 'k3')).rejects.toMatchObject({ status: 400 });

    t.db.productReview.update.mockResolvedValue(adminRow({ status: 'APPROVED', version: 3, staffReply: 'ممنون' }));
    await t.service.reply('staff', 'req', 'r1', { expectedVersion: 2, reply: ' ممنون ' }, 'k4');
    expect(t.db.productReview.update.mock.calls[0]![0].data).toMatchObject({ staffReply: 'ممنون', staffRepliedById: 'staff', version: { increment: 1 } });
    expect(t.db.inAppNotification.createMany).toHaveBeenCalledTimes(1);
    expect(t.audit.record).toHaveBeenLastCalledWith(expect.objectContaining({ action: 'review.replied' }), expect.anything());

    t.db.productReview.update.mockResolvedValue(adminRow({ status: 'APPROVED', version: 4 }));
    t.db.productReview.findUnique.mockResolvedValue(reviewRow({ status: 'APPROVED', version: 3, staffReply: 'ممنون' }));
    await t.service.reply('staff', 'req', 'r1', { expectedVersion: 3, reply: null }, 'k5');
    expect(t.db.productReview.update.mock.calls[1]![0].data).toMatchObject({ staffReply: null, staffRepliedById: null, staffRepliedAt: null });
    expect(t.db.inAppNotification.createMany).toHaveBeenCalledTimes(1);
    expect(t.audit.record).toHaveBeenLastCalledWith(expect.objectContaining({ action: 'review.reply_removed', before: { version: 3, hadReply: true } }), expect.anything());
  });
});
