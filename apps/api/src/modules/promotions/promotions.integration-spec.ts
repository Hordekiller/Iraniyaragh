import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../../database/prisma.service';
import { assertIsolatedTestDatabase } from '../../test/database-url.guard';
import { AuditLogService } from '../audit/audit-log.service';
import { EMPTY_AXIS_SIGNATURE, canonicalizeSku } from '../catalog/variant-identifiers';
import { InventoryService } from '../inventory/inventory.service';
import { CartCouponService } from '../orders/cart-coupon.service';
import { CartService } from '../orders/cart.service';
import { CheckoutService } from '../orders/checkout.service';
import { ConfiguredShippingQuoteAdapter } from '../orders/configured-shipping-quote.adapter';
import { OrderCommandService } from '../orders/order-command.service';
import { PromotionAdminService } from './promotion-admin.service';
import { promotionsService } from './promotions.service';
import type { PromotionInput } from '@iranyaragh/contracts';

describe.sequential('Promotions database integration', () => {
  const run = randomUUID().replaceAll('-', '').slice(0, 16);
  const prisma = new PrismaService();
  const audit = new AuditLogService(prisma);
  const shipping = new ConfiguredShippingQuoteAdapter(prisma);
  const checkout = new CheckoutService(prisma, audit, shipping);
  const cartService = new CartService(prisma);
  const coupons = new CartCouponService(prisma, cartService, { enforce: async () => undefined } as never, audit);
  const orders = new OrderCommandService(prisma, audit, new InventoryService(prisma, audit));
  const admin = new PromotionAdminService(prisma, audit);
  const ids = {
    users: [0, 1, 2].map((i) => `pu_${run}_${i}`),
    customers: [0, 1, 2].map((i) => `pc_${run}_${i}`),
    product: `pp_${run}`, v1: `pv1_${run}`, v2: `pv2_${run}`, brand: `pb_${run}`, category: `pcat_${run}`,
    wh: `pw_${run}`, loc: `pl_${run}`, ship: `ps_${run}`, staff: `pstaff_${run}`,
  };
  const method = `PROMO${run.slice(0, 8).toUpperCase()}`.toLowerCase();
  const address = { provinceCode: 'teh', city: 'تهران', address: 'خیابان آزادی، پلاک ۱۰', postalCode: '1234567890', recipient: 'گیرنده آزمون', mobile: '09123456789' };
  let seq = 0;
  const key = () => `k-${run}-${seq++}`;

  const base = (o: Partial<PromotionInput> = {}): PromotionInput => ({
    name: `promo-${run}-${seq++}`, description: null, badgeText: null, kind: 'PERCENTAGE', mode: 'COUPON', percentBp: 1000,
    amount: null, maxDiscount: null, minOrder: null, maxOrder: null, startsAt: null, endsAt: null, maxRedemptions: null,
    perCustomerLimit: null, firstPurchaseOnly: false, customerId: null, stackable: false, priority: 100, targets: [], ...o,
  });
  async function makePromo(o: Partial<PromotionInput> = {}, code?: string, couponOpts: { maxRedemptions?: number | null; customerId?: string | null } = {}) {
    const promotion = await admin.create(ids.staff, 'req', base(o), key());
    let couponCode: string | null = null;
    if (promotion.mode === 'COUPON') {
      couponCode = code ?? `T${run.slice(0, 6).toUpperCase()}${seq++}`;
      await admin.generateCoupons(ids.staff, 'req', promotion.id, { code: couponCode, maxRedemptions: couponOpts.maxRedemptions ?? null, customerId: couponOpts.customerId ?? null }, key());
    }
    return { promotion, code: couponCode! };
  }
  async function seedCart(customerId: string, items: { variantId: string; quantity: number }[]) {
    const cart = await prisma.cart.upsert({ where: { customerId }, create: { customerId }, update: { version: { increment: 1 } } });
    await prisma.cartCouponIntent.deleteMany({ where: { cartId: cart.id } });
    await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    await prisma.cartItem.createMany({ data: items.map((i) => ({ cartId: cart.id, ...i })) });
  }
  async function placeOrder(i: number, code?: string, requestKey = key()) {
    await seedCart(ids.customers[i]!, [{ variantId: ids.v1, quantity: 2 }, { variantId: ids.v2, quantity: 1 }]); // 400000
    if (code) await coupons.apply(ids.users[i]!, code, 'req');
    const preview = await checkout.previewForUser(ids.users[i]!, address);
    const quote = preview.data.shipping.find((s) => s.method === method)!;
    return checkout.createForUser(ids.users[i]!, { address, shippingQuoteId: quote.quoteId }, requestKey, `co-${seq++}`);
  }
  const redemptions = (orderId: string) => prisma.promotionRedemption.findMany({ where: { orderId } });

  beforeAll(async () => {
    assertIsolatedTestDatabase({ databaseUrl: process.env.DATABASE_URL, nodeEnvironment: process.env.NODE_ENV });
    await prisma.$connect();
    await prisma.user.createMany({
      data: [...ids.users, ids.staff].map((id) => ({ id, email: `${id}@example.test`, status: 'ACTIVE' as const, isEmailVerified: true, createdAt: new Date(Date.now() - 60_000), emailVerifiedAt: new Date() })),
    });
    await prisma.customer.createMany({ data: ids.customers.map((id, i) => ({ id, userId: ids.users[i]!, mobile: `+9891${(Number.parseInt(run.slice(0, 7), 16) % 10_000_000).toString().padStart(7, '0')}${i}` })) });
    await prisma.brand.create({ data: { id: ids.brand, name: 'Brand', slug: `brand-${run}` } });
    await prisma.category.create({ data: { id: ids.category, name: 'Cat', slug: `cat-${run}` } });
    await prisma.product.create({ data: { id: ids.product, name: 'P', slug: `p-${run}`, status: 'ACTIVE', brandId: ids.brand, categoryId: ids.category } });
    await prisma.productVariant.createMany({
      data: [
        { id: ids.v1, productId: ids.product, sku: `PV1-${run}`, skuKey: canonicalizeSku(`PV1-${run}`), combinationSignature: EMPTY_AXIS_SIGNATURE, title: 'V1', salePrice: 100000n, costPrice: 1n },
        { id: ids.v2, productId: ids.product, sku: `PV2-${run}`, skuKey: canonicalizeSku(`PV2-${run}`), combinationSignature: 'sig-v2', title: 'V2', salePrice: 200000n, costPrice: 1n },
      ],
    });
    await prisma.warehouse.create({ data: { id: ids.wh, code: `PWH-${run}`, name: 'W' } });
    await prisma.warehouseLocation.create({ data: { id: ids.loc, warehouseId: ids.wh, code: 'A', name: 'A' } });
    await prisma.shippingMethod.create({ data: { id: ids.ship, code: method, title: 'Promo shipping', amount: 50000n, policyRevision: 'p-v1' } });
  });

  beforeEach(async () => {
    await clean();
    for (const variantId of [ids.v1, ids.v2]) {
      await prisma.inventoryBalance.create({ data: { warehouseId: ids.wh, locationId: ids.loc, variantId, onHand: 1000, reserved: 0, available: 1000, version: 1 } });
    }
  });

  async function clean() {
    const promos = await prisma.promotion.findMany({ where: { name: { startsWith: `promo-${run}` } }, select: { id: true } });
    const pids = promos.map((p) => p.id);
    const orderIds = (await prisma.order.findMany({ where: { customerId: { in: ids.customers } }, select: { id: true } })).map((o) => o.id);
    await prisma.promotionRedemption.deleteMany({ where: { OR: [{ promotionId: { in: pids } }, { orderId: { in: orderIds } }] } });
    await prisma.stockReservation.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.shippingQuote.deleteMany({ where: { customerId: { in: ids.customers } } });
    await prisma.checkoutIdempotencyRecord.deleteMany({ where: { customerId: { in: ids.customers } } });
    await prisma.orderCommandIdempotencyRecord.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.outboxEvent.deleteMany({ where: { aggregateId: { in: orderIds } } });
    await prisma.orderTransition.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    await prisma.cart.deleteMany({ where: { customerId: { in: ids.customers } } });
    await prisma.inventoryBalance.deleteMany({ where: { warehouseId: ids.wh } });
    await prisma.coupon.deleteMany({ where: { promotionId: { in: pids } } });
    await prisma.promotionCommand.deleteMany({ where: { actorId: ids.staff } });
    await prisma.promotion.deleteMany({ where: { id: { in: pids } } });
  }

  afterAll(async () => {
    await clean();
    await prisma.shippingMethod.deleteMany({ where: { id: ids.ship } });
    await prisma.warehouseLocation.deleteMany({ where: { warehouseId: ids.wh } });
    await prisma.warehouse.deleteMany({ where: { id: ids.wh } });
    await prisma.productVariant.deleteMany({ where: { productId: ids.product } });
    await prisma.product.deleteMany({ where: { id: ids.product } });
    await prisma.category.deleteMany({ where: { id: ids.category } });
    await prisma.brand.deleteMany({ where: { id: ids.brand } });
    await prisma.customer.deleteMany({ where: { id: { in: ids.customers } } });
    await prisma.auditLog.deleteMany({ where: { actorId: { in: [...ids.users, ids.staff] } } });
    await prisma.user.deleteMany({ where: { id: { in: [...ids.users, ids.staff] } } });
    await prisma.$disconnect();
  });

  it('percentage coupon: cart, quote, order and snapshot agree; ordinary orders stay undiscounted', async () => {
    const plain = await placeOrder(0);
    expect(plain.data.order.discount.amount).toBe('0');
    expect(plain.data.order.total.amount).toBe('450000');
    expect(await redemptions(plain.data.order.id)).toHaveLength(0);

    const { promotion, code } = await makePromo({ percentBp: 1500, maxDiscount: 50000n.toString() });
    await seedCart(ids.customers[1]!, [{ variantId: ids.v1, quantity: 2 }, { variantId: ids.v2, quantity: 1 }]);
    const cart = await coupons.apply(ids.users[1]!, code.toLowerCase(), 'req');
    expect(cart.data.cart.promotion).toMatchObject({ couponCode: code, itemDiscount: { amount: '50000' }, payable: { amount: '350000' } });
    const order = await placeOrder(1, code);
    expect(order.data.order).toMatchObject({ subtotal: { amount: '400000' }, discount: { amount: '50000' }, shipping: { amount: '50000' }, total: { amount: '400000' } });
    const persisted = await prisma.order.findUniqueOrThrow({ where: { id: order.data.order.id } });
    expect(persisted.subtotal - persisted.discount + persisted.shipping).toBe(persisted.grandTotal);
    const [r] = await redemptions(order.data.order.id);
    expect(r).toMatchObject({ status: 'RESERVED', discountAmount: 50000n, promotionId: promotion.id });
    expect((r!.snapshot as { promotionVersion: number }).promotionVersion).toBe(1);
    const p = await prisma.promotion.findUniqueOrThrow({ where: { id: promotion.id } });
    expect(p.usedCount).toBe(1);
    // coupon intent cleared with the cart
    expect(await prisma.cartCouponIntent.count()).toBe(0);
  });

  it('rejects invalid, unknown, inactive, scheduled, expired and foreign coupons with precise codes', async () => {
    await seedCart(ids.customers[0]!, [{ variantId: ids.v1, quantity: 1 }]);
    const reject = async (code: string) => coupons.apply(ids.users[0]!, code, 'req').then(() => 'ok', (e) => (e.getResponse() as { code: string }).code);
    expect(await reject('NOPE1234')).toBe('COUPON_NOT_FOUND');
    expect(await reject('!!')).toBe('COUPON_NOT_FOUND');
    const future = await makePromo({ startsAt: new Date(Date.now() + 3_600_000).toISOString() });
    expect(await reject(future.code)).toBe('COUPON_NOT_STARTED');
    const past = await makePromo({ startsAt: new Date(Date.now() - 7_200_000).toISOString(), endsAt: new Date(Date.now() - 3_600_000).toISOString() });
    expect(await reject(past.code)).toBe('COUPON_EXPIRED');
    const off = await makePromo();
    await admin.setActive(ids.staff, 'req', off.promotion.id, false, 1, key());
    expect(await reject(off.code)).toBe('COUPON_INACTIVE');
    const mine = await makePromo({}, undefined, { customerId: ids.customers[1]! });
    expect(await reject(mine.code)).toBe('COUPON_NOT_ELIGIBLE');
    const minimum = await makePromo({ minOrder: '999999999' });
    expect(await reject(minimum.code)).toBe('COUPON_NOT_APPLICABLE');
  });

  it('a campaign stopped after preview invalidates the quote instead of discounting', async () => {
    const { promotion, code } = await makePromo();
    await seedCart(ids.customers[0]!, [{ variantId: ids.v1, quantity: 1 }]);
    await coupons.apply(ids.users[0]!, code, 'req');
    const preview = await checkout.previewForUser(ids.users[0]!, address);
    const quote = preview.data.shipping.find((s) => s.method === method)!;
    expect(quote.promotionDiscount?.amount).toBe('10000');
    await admin.setActive(ids.staff, 'req', promotion.id, false, 1, key());
    await expect(checkout.createForUser(ids.users[0]!, { address, shippingQuoteId: quote.quoteId }, key(), 'req')).rejects.toMatchObject({ response: { code: 'QUOTE_CHANGED' } });
    expect(await prisma.order.count({ where: { customerId: ids.customers[0]! } })).toBe(0);
  });

  it('concurrent checkouts cannot exceed a one-use coupon', async () => {
    const { promotion, code } = await makePromo({ maxRedemptions: 1 });
    for (const i of [0, 1, 2]) {
      await seedCart(ids.customers[i]!, [{ variantId: ids.v1, quantity: 1 }]);
      await coupons.apply(ids.users[i]!, code, 'req');
    }
    const quotes = await Promise.all([0, 1, 2].map(async (i) => {
      const preview = await checkout.previewForUser(ids.users[i]!, address);
      return preview.data.shipping.find((s) => s.method === method)!.quoteId;
    }));
    const settled = await Promise.allSettled([0, 1, 2].map((i) => checkout.createForUser(ids.users[i]!, { address, shippingQuoteId: quotes[i]! }, key(), 'req')));
    expect(settled.filter((s) => s.status === 'fulfilled')).toHaveLength(1);
    for (const s of settled) if (s.status === 'rejected') expect(['QUOTE_CHANGED', 'COUPON_EXHAUSTED', 'CONFLICT']).toContain((s.reason.getResponse?.() as { code: string } | undefined)?.code ?? JSON.stringify([s.reason.code, s.reason.meta]));
    const p = await prisma.promotion.findUniqueOrThrow({ where: { id: promotion.id } });
    expect(p.usedCount).toBe(1);
    expect(await prisma.promotionRedemption.count({ where: { promotionId: promotion.id } })).toBe(1);
  });

  it('idempotent checkout retry reserves once', async () => {
    const { promotion, code } = await makePromo();
    const k = key();
    const first = await placeOrder(0, code, k);
    const preview = await checkout.previewForUser(ids.users[0]!, address).catch(() => null);
    expect(preview).toBeNull(); // cart consumed
    const replay = await checkout.createForUser(ids.users[0]!, { address, shippingQuoteId: first.data.order.shippingQuote.quoteId }, k, 'req');
    expect(replay.data.order.id).toBe(first.data.order.id);
    expect((await prisma.promotion.findUniqueOrThrow({ where: { id: promotion.id } })).usedCount).toBe(1);
  });

  it('per-customer limit counts reserved usage and blocks a second order', async () => {
    const { code } = await makePromo({ perCustomerLimit: 1 });
    await placeOrder(0, code);
    await seedCart(ids.customers[0]!, [{ variantId: ids.v1, quantity: 1 }]);
    await expect(coupons.apply(ids.users[0]!, code, 'req')).rejects.toMatchObject({ response: { code: 'COUPON_CUSTOMER_LIMIT' } });
    await seedCart(ids.customers[1]!, [{ variantId: ids.v1, quantity: 1 }]);
    await expect(coupons.apply(ids.users[1]!, code, 'req')).resolves.toBeDefined();
  });

  it('cancellation releases capacity once; settlement confirms once; refunds follow the stated rule', async () => {
    const { promotion, code } = await makePromo({ maxRedemptions: 1 });
    const first = await placeOrder(0, code);
    await seedCart(ids.customers[1]!, [{ variantId: ids.v1, quantity: 1 }]);
    await expect(coupons.apply(ids.users[1]!, code, 'req')).rejects.toMatchObject({ response: { code: 'COUPON_EXHAUSTED' } });

    await orders.cancelAsCustomer(ids.users[0]!, first.data.order.id, { idempotencyKey: key(), requestId: `cancel-${seq++}` });
    let [r] = await redemptions(first.data.order.id);
    expect(r).toMatchObject({ status: 'RELEASED', releaseReason: 'CUSTOMER_CANCELLED' });
    expect((await prisma.promotion.findUniqueOrThrow({ where: { id: promotion.id } })).usedCount).toBe(0);
    await prisma.$transaction((tx) => promotionsService.releaseForOrder(tx, first.data.order.id, 'AGAIN'));
    expect((await prisma.promotion.findUniqueOrThrow({ where: { id: promotion.id } })).usedCount).toBe(0); // idempotent

    const second = await placeOrder(1, code);
    expect(await prisma.$transaction((tx) => promotionsService.confirmForOrder(tx, second.data.order.id))).toBe(1);
    expect(await prisma.$transaction((tx) => promotionsService.confirmForOrder(tx, second.data.order.id))).toBe(0); // callback replay
    // a late cancellation can never return confirmed (paid) capacity
    expect(await prisma.$transaction((tx) => promotionsService.releaseForOrder(tx, second.data.order.id, 'LATE'))).toBe(0);

    const total = BigInt(second.data.order.total.amount);
    await prisma.$transaction((tx) => promotionsService.applyRefund(tx, second.data.order.id, { paidTotal: total, refundedTotal: total / 4n }));
    [r] = await redemptions(second.data.order.id);
    expect(r!.status).toBe('CONFIRMED');
    expect(r!.refundedDiscount).toBe((r!.discountAmount * (total / 4n)) / total);
    expect((await prisma.promotion.findUniqueOrThrow({ where: { id: promotion.id } })).usedCount).toBe(1);

    await prisma.$transaction((tx) => promotionsService.applyRefund(tx, second.data.order.id, { paidTotal: total, refundedTotal: total }));
    await prisma.$transaction((tx) => promotionsService.applyRefund(tx, second.data.order.id, { paidTotal: total, refundedTotal: total }));
    [r] = await redemptions(second.data.order.id);
    expect(r).toMatchObject({ status: 'REFUNDED', refundedDiscount: r!.discountAmount });
    expect((await prisma.promotion.findUniqueOrThrow({ where: { id: promotion.id } })).usedCount).toBe(0);
  });

  it('first-purchase coupon is refused for customers with an existing order', async () => {
    const { code } = await makePromo({ firstPurchaseOnly: true });
    await seedCart(ids.customers[0]!, [{ variantId: ids.v1, quantity: 1 }]);
    await expect(coupons.apply(ids.users[0]!, code, 'req')).resolves.toBeDefined();
    await placeOrder(1);
    await seedCart(ids.customers[1]!, [{ variantId: ids.v1, quantity: 1 }]);
    await expect(coupons.apply(ids.users[1]!, code, 'req')).rejects.toMatchObject({ response: { code: 'COUPON_NOT_ELIGIBLE' } });
  });

  it('free shipping discounts only the shipping line and keeps totals consistent', async () => {
    const { code } = await makePromo({ kind: 'FREE_SHIPPING', percentBp: null });
    const order = await placeOrder(0, code);
    expect(order.data.order).toMatchObject({ discount: { amount: '50000' }, shipping: { amount: '50000' }, total: { amount: '400000' } });
    const [r] = await redemptions(order.data.order.id);
    expect(r).toMatchObject({ discountAmount: 50000n, shippingDiscount: 50000n });
  });

  it('automatic campaigns apply without a code, category/brand targeted, and respect stacking', async () => {
    await makePromo({ mode: 'AUTOMATIC', percentBp: 1000, targets: [{ type: 'CATEGORY', targetId: ids.category, exclude: false }], stackable: true });
    await makePromo({ mode: 'AUTOMATIC', kind: 'FIXED_CART', percentBp: null, amount: '10000', stackable: true, priority: 200, targets: [{ type: 'BRAND', targetId: ids.brand, exclude: false }] });
    const order = await placeOrder(0);
    expect(order.data.order.discount.amount).toBe('50000'); // 10% of 400000 (category) then 10000 fixed (brand), stacked
  });

  it('admin commands are idempotent, versioned, validated and audited', async () => {
    const k = key();
    const input = base();
    const a = await admin.create(ids.staff, 'req', input, k);
    const b = await admin.create(ids.staff, 'req', input, k);
    expect(b.id).toBe(a.id);
    await expect(admin.create(ids.staff, 'req', { ...input, name: `${input.name}x` }, k)).rejects.toMatchObject({ response: { code: 'IDEMPOTENCY_CONFLICT' } });
    await expect(admin.update(ids.staff, 'req', a.id, input, 99, key())).rejects.toMatchObject({ response: { code: 'STALE_VERSION' } });
    const updated = await admin.update(ids.staff, 'req', a.id, { ...input, percentBp: 2000 }, 1, key());
    expect(updated.version).toBe(2);
    await expect(admin.create(ids.staff, 'req', { ...input, percentBp: 20000 }, key())).rejects.toMatchObject({ response: { code: 'INVALID_REQUEST' } });
    await expect(admin.create(ids.staff, 'req', { ...input, targets: [{ type: 'BRAND', targetId: 'missing', exclude: false }] }, key())).rejects.toMatchObject({ response: { code: 'INVALID_REQUEST' } });
    const c = await makePromo();
    await expect(admin.generateCoupons(ids.staff, 'req', c.promotion.id, { code: c.code, maxRedemptions: null, customerId: null }, key())).rejects.toMatchObject({ response: { code: 'COUPON_CODE_TAKEN' } });
    expect(await prisma.auditLog.count({ where: { entityId: a.id, action: { in: ['promotion.created', 'promotion.updated'] } } })).toBe(2);
    const list = await admin.list({ q: input.name, offset: 0, limit: 10 });
    expect(list.items[0]!.state).toBe('ACTIVE');
  });

  it('reports separate reserved, paid, refunded and cancelled usage from persisted rows', async () => {
    const { promotion, code } = await makePromo();
    const o1 = await placeOrder(0, code);
    const o2 = await placeOrder(1, code);
    await prisma.$transaction((tx) => promotionsService.confirmForOrder(tx, o1.data.order.id));
    await orders.cancelAsCustomer(ids.users[1]!, o2.data.order.id, { idempotencyKey: key(), requestId: `cancel-${seq++}` });
    const detail = await admin.get(promotion.id);
    expect(detail.stats).toMatchObject({ confirmed: 1, released: 1, reserved: 0, discountConfirmed: { amount: '40000' }, salesAttributed: { amount: o1.data.order.total.amount } });
    const history = await admin.redemptions({ promotionId: promotion.id, offset: 0, limit: 10 });
    expect(history.total).toBe(2);
  });
});
