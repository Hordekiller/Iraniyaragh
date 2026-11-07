import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../database/prisma.service';
import { AuditLogService } from '../audit/audit-log.service';
import { assertIsolatedTestDatabase } from '../../test/database-url.guard';
import { ReviewsService } from './reviews.service';

describe.sequential('Product reviews on real PostgreSQL', () => {
  const prisma = new PrismaService();
  const service = new ReviewsService(prisma, new AuditLogService(prisma));
  const run = randomUUID().replaceAll('-', '').slice(0, 10);
  const key = () => `k-${randomUUID()}`;
  const ids = { staff: '', buyerUser: '', buyer: '', otherUser: '', other: '', product: '', otherProduct: '', variant: '', otherVariant: '' };
  const orders: string[] = [];
  const extraVariants: string[] = [];
  const extraProducts: string[] = [];
  const text = { rating: 5, title: 'عالی', body: 'کیفیت لولا و نصب آن بسیار خوب بود.' };

  async function order(customerId: string, variantId: string, delivered: boolean) {
    const row = await prisma.order.create({
      data: {
        number: `RV-${run}-${orders.length}`, customerId, status: 'PAID', subtotal: 10n, grandTotal: 10n, addressSnapshot: {}, shippingMethod: 'x', shippingMethodTitle: 'x',
        shippingPolicyRevision: 'r', pricePolicyRevision: 'r', reservationExpiresAt: new Date(),
        items: { create: [{ variantId, sku: `s-${run}`, title: 't', productTitle: 'p', ordinal: 1, quantity: 1, unitPrice: 10n, total: 10n }] },
        fulfillment: { create: { status: delivered ? 'DELIVERED' : 'PROCESSING' } },
      },
    });
    orders.push(row.id);
    return row;
  }

  beforeAll(async () => {
    assertIsolatedTestDatabase({ databaseUrl: process.env.DATABASE_URL, nodeEnvironment: process.env.NODE_ENV });
    await prisma.$connect();
    const digits = (n: string) => run.replace(/\D/gu, '').padEnd(7, n).slice(0, 7);
    ids.staff = (await prisma.user.create({ data: { mobile: `+98913${digits('3')}`, firstName: 'مدیر', lastName: 'نظرات' } })).id;
    ids.buyerUser = (await prisma.user.create({ data: { mobile: `+98914${digits('4')}`, status: 'ACTIVE', isMobileVerified: true, mobileVerifiedAt: new Date(), createdAt: new Date(Date.now() - 60_000) } })).id;
    ids.otherUser = (await prisma.user.create({ data: { mobile: `+98915${digits('5')}`, status: 'ACTIVE', isMobileVerified: true, mobileVerifiedAt: new Date(), createdAt: new Date(Date.now() - 60_000) } })).id;
    ids.buyer = (await prisma.customer.create({ data: { userId: ids.buyerUser, mobile: `+98914${digits('4')}`, firstName: 'احمد', lastName: 'رضایی' } })).id;
    ids.other = (await prisma.customer.create({ data: { userId: ids.otherUser, mobile: `+98915${digits('5')}`, firstName: 'سارا', lastName: 'کریمی' } })).id;
    const make = async (suffix: string) => {
      const product = await prisma.product.create({ data: { name: `لولا ${suffix}`, slug: `rev-${run}-${suffix}`, status: 'ACTIVE' } });
      const variant = await prisma.productVariant.create({ data: { productId: product.id, sku: `S-${run}-${suffix}`, skuKey: `s-${run}-${suffix}`, salePrice: 10n, combinationSignature: `sig-${run}-${suffix}` } });
      return { product: product.id, variant: variant.id };
    };
    const a = await make('a'); const b = await make('b');
    Object.assign(ids, { product: a.product, variant: a.variant, otherProduct: b.product, otherVariant: b.variant });
  });

  afterAll(async () => {
    await prisma.productReview.deleteMany({ where: { productId: { in: [ids.product, ids.otherProduct, ...extraProducts] } } });
    await prisma.productReviewCommand.deleteMany({ where: { actorId: { in: [ids.staff, ids.buyerUser, ids.otherUser] } } });
    await prisma.fulfillment.deleteMany({ where: { orderId: { in: orders } } });
    await prisma.order.deleteMany({ where: { id: { in: orders } } });
    await prisma.customer.deleteMany({ where: { id: { in: [ids.buyer, ids.other] } } });
    await prisma.productVariant.deleteMany({ where: { id: { in: [ids.variant, ids.otherVariant, ...extraVariants] } } });
    await prisma.product.deleteMany({ where: { id: { in: [ids.product, ids.otherProduct, ...extraProducts] } } });
    await prisma.auditLog.deleteMany({ where: { actorId: { in: [ids.staff, ids.buyerUser, ids.otherUser] } } });
    await prisma.user.deleteMany({ where: { id: { in: [ids.staff, ids.buyerUser, ids.otherUser] } } });
    await prisma.$disconnect();
  });

  const slug = () => `rev-${run}-a`;

  it('refuses a review before delivery and for products never bought', async () => {
    await order(ids.buyer, ids.variant, false);
    expect(await service.eligibility(ids.buyerUser, slug())).toMatchObject({ canReview: false, reason: 'NOT_PURCHASED' });
    await expect(service.create(ids.buyerUser, 'req', slug(), text, key())).rejects.toMatchObject({ response: { code: 'REVIEW_NOT_ELIGIBLE' } });
    await order(ids.other, ids.otherVariant, true);
    await expect(service.create(ids.otherUser, 'req', slug(), text, key())).rejects.toMatchObject({ response: { code: 'REVIEW_NOT_ELIGIBLE' } });
  });

  it('creates a private PENDING review for a delivered purchase, once, and replays idempotently', async () => {
    const delivered = await order(ids.buyer, ids.variant, true);
    expect(await service.eligibility(ids.buyerUser, slug())).toMatchObject({ canReview: true, reason: 'ELIGIBLE' });
    const k = key();
    const created = await service.create(ids.buyerUser, 'req', slug(), text, k);
    expect(created).toMatchObject({ status: 'PENDING', rating: 5, version: 1 });
    expect(await service.create(ids.buyerUser, 'req', slug(), text, k)).toEqual(created);
    await expect(service.create(ids.buyerUser, 'req', slug(), text, k)).resolves.toBeDefined();
    await expect(service.create(ids.buyerUser, 'req', slug(), text, key())).rejects.toMatchObject({ response: { code: 'ALREADY_REVIEWED' } });
    await expect(service.create(ids.buyerUser, 'req', slug(), { ...text, rating: 1 }, k)).rejects.toMatchObject({ response: { code: 'IDEMPOTENCY_CONFLICT' } });
    const stored = await prisma.productReview.findUniqueOrThrow({ where: { id: created.id } });
    expect(stored.orderId).toBe(delivered.id);
    const publicList = await service.listPublic(slug(), 1, 'newest');
    expect(publicList.summary.count).toBe(0);
    expect(publicList.items).toHaveLength(0);
  });

  it('publishes on approval, notifies the author, aggregates, and exposes only a safe name', async () => {
    const own = await service.eligibility(ids.buyerUser, slug());
    const review = own.review!;
    await expect(service.moderate(ids.staff, 'req', review.id, { action: 'approve', expectedVersion: 99, note: null }, key())).rejects.toMatchObject({ response: { code: 'STALE_VERSION' } });
    await expect(service.moderate(ids.staff, 'req', review.id, { action: 'hide', expectedVersion: 1, note: 'دلیل' }, key())).rejects.toMatchObject({ response: { code: 'INVALID_TRANSITION' } });
    const approved = await service.moderate(ids.staff, 'req', review.id, { action: 'approve', expectedVersion: 1, note: null }, key());
    expect(approved).toMatchObject({ status: 'APPROVED', version: 2 });
    expect(approved.publishedAt).not.toBeNull();
    const list = await service.listPublic(slug(), 1, 'newest');
    expect(list.summary).toEqual({ count: 1, average: 5, counts: [0, 0, 0, 0, 1] });
    expect(list.items[0]).toMatchObject({ authorName: 'احمد ر.', verifiedPurchase: true });
    expect(JSON.stringify(list)).not.toContain('+98');
    const notice = await prisma.inAppNotification.findFirst({ where: { userId: ids.buyerUser, kind: 'REVIEW_APPROVED' } });
    expect(notice).toMatchObject({ audience: 'CUSTOMER' });
    expect(notice?.href).toContain(`/products/rev-${run}-a`);
    expect((await service.summaryItems([ids.product, ids.otherProduct]))).toEqual([{ productId: ids.product, average: 5, count: 1 }]);
    expect(await prisma.auditLog.count({ where: { actorId: ids.staff, action: 'review.approve', entityId: review.id } })).toBe(1);
  });

  it('shows a store reply only on published reviews and removes it when asked', async () => {
    const id = (await service.eligibility(ids.buyerUser, slug())).review!.id;
    const replied = await service.reply(ids.staff, 'req', id, { expectedVersion: 2, reply: 'ممنون از نظر شما' }, key());
    expect(replied.staffReply).toBe('ممنون از نظر شما');
    expect((await service.listPublic(slug(), 1, 'newest')).items[0]!.staffReply).toBe('ممنون از نظر شما');
    expect(await prisma.inAppNotification.count({ where: { userId: ids.buyerUser, kind: 'REVIEW_REPLIED' } })).toBe(1);
    const removed = await service.reply(ids.staff, 'req', id, { expectedVersion: 3, reply: null }, key());
    expect(removed.staffReply).toBeNull();
  });

  it('returns an edited review to moderation, hides it publicly and drops the old reply', async () => {
    await service.reply(ids.staff, 'req', (await service.eligibility(ids.buyerUser, slug())).review!.id, { expectedVersion: 4, reply: 'پاسخ قدیمی' }, key());
    const current = (await service.eligibility(ids.buyerUser, slug())).review!;
    const edited = await service.updateOwn(ids.buyerUser, 'req', current.id, current.version, { rating: 3, title: null, body: 'پس از چند ماه استفاده نظرم کمی تغییر کرد.' }, key());
    expect(edited).toMatchObject({ status: 'PENDING', rating: 3 });
    const row = await prisma.productReview.findUniqueOrThrow({ where: { id: current.id } });
    expect(row.staffReply).toBeNull();
    expect((await service.listPublic(slug(), 1, 'newest')).summary.count).toBe(0);
    await expect(service.updateOwn(ids.otherUser, 'req', current.id, edited.version, text, key())).rejects.toMatchObject({ status: 404 });
  });

  it('requires a reason to reject, delivers it to the author, and lets a moderator re-approve', async () => {
    const current = (await service.eligibility(ids.buyerUser, slug())).review!;
    await expect(service.moderate(ids.staff, 'req', current.id, { action: 'reject', expectedVersion: current.version, note: '' }, key())).rejects.toMatchObject({ status: 400 });
    const rejected = await service.moderate(ids.staff, 'req', current.id, { action: 'reject', expectedVersion: current.version, note: 'متن با تجربهٔ واقعی تطابق ندارد' }, key());
    expect(rejected.status).toBe('REJECTED');
    expect((await service.eligibility(ids.buyerUser, slug())).review).toMatchObject({ status: 'REJECTED', moderationNote: 'متن با تجربهٔ واقعی تطابق ندارد' });
    await expect(service.reply(ids.staff, 'req', current.id, { expectedVersion: rejected.version, reply: 'x' }, key())).rejects.toMatchObject({ response: { code: 'INVALID_TRANSITION' } });
    const again = await service.moderate(ids.staff, 'req', current.id, { action: 'approve', expectedVersion: rejected.version, note: null }, key());
    expect(again.status).toBe('APPROVED');
    expect((await service.listPublic(slug(), 1, 'lowest')).summary).toMatchObject({ count: 1, average: 3 });
  });

  it('enforces database invariants even against direct writes', async () => {
    const stray = { productId: ids.otherProduct, customerId: ids.buyer, orderId: 'x', body: 'متن آزمایشی کافی' };
    await expect(prisma.productReview.create({ data: { ...stray, rating: 6 } })).rejects.toThrow();
    await expect(prisma.productReview.create({ data: { ...stray, rating: 4, status: 'APPROVED' } })).rejects.toThrow();
  });

  it('never exposes aggregates of inactive products and resolves racing identical retries without a false conflict', async () => {
    const product = await prisma.product.create({ data: { name: `لولا c`, slug: `rev-${run}-c`, status: 'ACTIVE' } });
    const variant = await prisma.productVariant.create({ data: { productId: product.id, sku: `S-${run}-c`, skuKey: `s-${run}-c`, salePrice: 10n, combinationSignature: `sig-${run}-c` } });
    extraVariants.push(variant.id); extraProducts.push(product.id);
    try {
      await order(ids.other, variant.id, true);
      const retry = key();
      const settled = await Promise.allSettled([
        service.create(ids.otherUser, 'req', product.slug, text, retry), service.create(ids.otherUser, 'req', product.slug, text, retry),
      ]);
      const created = settled.filter(r => r.status === 'fulfilled');
      expect(created.length).toBeGreaterThanOrEqual(1);
      for (const r of settled) if (r.status === 'rejected') expect(['CONCURRENT_UPDATE', 'IDEMPOTENCY_CONFLICT', 'ALREADY_REVIEWED']).toContain((r.reason as { response?: { code?: string } }).response?.code);
      expect(await prisma.productReview.count({ where: { productId: product.id } })).toBe(1);
      const review = await prisma.productReview.findFirstOrThrow({ where: { productId: product.id } });
      await service.moderate(ids.staff, 'req', review.id, { action: 'approve', expectedVersion: review.version, note: null }, key());
      expect(await service.summaryItems([product.id])).toMatchObject([{ productId: product.id, count: 1 }]);
      await prisma.product.update({ where: { id: product.id }, data: { status: 'INACTIVE' } });
      expect(await service.summaryItems([product.id])).toEqual([]);
    } finally {
      await prisma.productReview.deleteMany({ where: { productId: product.id } });
    }
  });
});
