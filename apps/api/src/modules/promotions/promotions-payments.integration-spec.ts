import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PromotionInput } from '@iranyaragh/contracts';
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
import { AdminPaymentRefundService } from '../payments/admin-payment-refund.service';
import { PaymentInitiationService } from '../payments/payment-initiation.service';
import type { PaymentGatewayConfig, PaymentProvider, PaymentVerifyResult } from '../payments/payment-provider.port';
import { PaymentVerificationService } from '../payments/payment-verification.service';
import { StaffOrderService } from '../orders/staff-order.service';
import { InvoiceDocumentService } from '../invoices/invoice-document.service';
import { InvoiceDraftService } from '../invoices/invoice-draft.service';
import { InvoicePolicyService } from '../invoices/invoice-policy.service';
import { PromotionAdminService } from './promotion-admin.service';

/**
 * Real services, real PostgreSQL. Only the external gateway is simulated; this
 * proves the promotion lifecycle, not live Zarinpal acceptance.
 */
describe.sequential('Promotions x payment, cancellation and refund lifecycle', () => {
  const run = randomUUID().replaceAll('-', '').slice(0, 14);
  const prisma = new PrismaService();
  const audit = new AuditLogService(prisma);
  const inventory = new InventoryService(prisma, audit);
  const gateway: PaymentGatewayConfig = { providerName: 'zarinpal', mode: 'sandbox', callbackUrl: 'http://localhost:4321/cb', timeoutMs: 100 };
  let authoritySeq = 0;
  const provider = {
    providerName: 'zarinpal' as const,
    authorize: vi.fn(async () => ({ status: 'redirect' as const, authority: `A${run}${authoritySeq++}`, redirectUrl: 'http://localhost/pay' })),
    verify: vi.fn(async (r: { correlationId: string }): Promise<PaymentVerifyResult> => ({ status: 'verified', referenceId: `REF-${r.correlationId}` })),
  };
  const checkout = new CheckoutService(prisma, audit, new ConfiguredShippingQuoteAdapter(prisma));
  const cartService = new CartService(prisma);
  const coupons = new CartCouponService(prisma, cartService, { enforce: async () => undefined } as never, audit);
  const initiation = new PaymentInitiationService(prisma, provider as unknown as PaymentProvider, gateway);
  const verification = new PaymentVerificationService(prisma, provider as unknown as PaymentProvider, gateway as never, audit, inventory);
  const refunds = new AdminPaymentRefundService(prisma, audit);
  const orders = new OrderCommandService(prisma, audit, inventory);
  const admin = new PromotionAdminService(prisma, audit);
  const policies = new InvoicePolicyService(prisma, audit);
  const drafts = new InvoiceDraftService(prisma, audit, new StaffOrderService(prisma, audit), new ConfiguredShippingQuoteAdapter(prisma));
  const invoices = new InvoiceDocumentService(prisma, audit, drafts, policies);

  const ids = {
    users: [0, 1, 2].map((i) => `xu_${run}_${i}`),
    customers: [0, 1, 2].map((i) => `xc_${run}_${i}`),
    staff: `xstaff_${run}`, product: `xp_${run}`, v1: `xv1_${run}`, v2: `xv2_${run}`, wh: `xw_${run}`, loc: `xl_${run}`, ship: `xs_${run}`,
  };
  const method = `payx${run.slice(0, 8)}`.toLowerCase();
  const address = { provinceCode: 'teh', city: 'تهران', address: 'خیابان آزادی، پلاک ۱۰', postalCode: '1234567890', recipient: 'گیرنده آزمون', mobile: '09123456789' };
  let seq = 0;
  const key = () => `k-${run}-${seq++}`;
  const base = (o: Partial<PromotionInput> = {}): PromotionInput => ({
    name: `payx-${run}-${seq++}`, description: null, badgeText: null, kind: 'PERCENTAGE', mode: 'COUPON', percentBp: 1000,
    amount: null, maxDiscount: null, minOrder: null, maxOrder: null, startsAt: null, endsAt: null, maxRedemptions: null,
    perCustomerLimit: null, firstPurchaseOnly: false, customerId: null, stackable: false, priority: 100, targets: [], ...o,
  });
  async function makePromo(o: Partial<PromotionInput> = {}) {
    const promotion = await admin.create(ids.staff, 'req', base(o), key());
    const code = `X${run.slice(0, 6).toUpperCase()}${seq++}`;
    await admin.generateCoupons(ids.staff, 'req', promotion.id, { code, maxRedemptions: null, customerId: null }, key());
    return { promotion, code };
  }
  async function seedCart(i: number, quantity = 2, variantId = ids.v1) {
    const cart = await prisma.cart.upsert({ where: { customerId: ids.customers[i]! }, create: { customerId: ids.customers[i]! }, update: { version: { increment: 1 } } });
    await prisma.cartCouponIntent.deleteMany({ where: { cartId: cart.id } });
    await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    await prisma.cartItem.create({ data: { cartId: cart.id, variantId, quantity } });
  }
  async function preview(i: number) {
    const p = await checkout.previewForUser(ids.users[i]!, address);
    return p.data.shipping.find((s) => s.method === method)!.quoteId;
  }
  async function place(i: number, code?: string, quantity = 2, variantId = ids.v1) {
    await seedCart(i, quantity, variantId);
    if (code) await coupons.apply(ids.users[i]!, code, 'req');
    const quoteId = await preview(i);
    return (await checkout.createForUser(ids.users[i]!, { address, shippingQuoteId: quoteId }, key(), `co-${seq++}`)).data.order;
  }
  async function pay(i: number, orderId: string) {
    const res = await initiation.initiate({ userId: ids.users[i]!, orderId, idempotencyKey: key(), requestId: `init-${seq++}` });
    return res.data.payment.authority;
  }
  const verify = (authority: string, status: 'OK' | 'NOK' = 'OK') => verification.verify({ authority, status, requestId: `ver-${seq++}` });
  const refund = (paymentId: string, amount: bigint, idempotencyKey = key(), ref = `ZR-${run}-${seq++}`) =>
    refunds.record({ paymentId, actorId: ids.staff, requestId: `rf-${seq++}`, idempotencyKey, amountMinorUnits: amount.toString(), gatewayReferenceId: ref, reason: 'CANCELLED_SHIPMENT' });
  const promoOf = (id: string) => prisma.promotion.findUniqueOrThrow({ where: { id } });
  const redemptionOf = (orderId: string) => prisma.promotionRedemption.findFirstOrThrow({ where: { orderId } });
  const balance = () => prisma.inventoryBalance.findFirstOrThrow({ where: { warehouseId: ids.wh, variantId: ids.v1 } });

  beforeAll(async () => {
    assertIsolatedTestDatabase({ databaseUrl: process.env.DATABASE_URL, nodeEnvironment: process.env.NODE_ENV });
    await prisma.$connect();
    await prisma.user.createMany({
      data: [...ids.users, ids.staff].map((id) => ({ id, email: `${id}@example.test`, status: 'ACTIVE' as const, isEmailVerified: true, createdAt: new Date(Date.now() - 60_000), emailVerifiedAt: new Date() })),
    });
    const tail = (Number.parseInt(run.slice(0, 7), 16) % 10_000_000).toString().padStart(7, '0');
    await prisma.customer.createMany({ data: ids.customers.map((id, i) => ({ id, userId: ids.users[i]!, mobile: `+9892${tail}${i}` })) });
    await prisma.product.create({ data: { id: ids.product, name: 'P', slug: `px-${run}`, status: 'ACTIVE' } });
    await prisma.productVariant.createMany({
      data: [
        { id: ids.v1, productId: ids.product, sku: `PX1-${run}`, skuKey: canonicalizeSku(`PX1-${run}`), combinationSignature: EMPTY_AXIS_SIGNATURE, title: 'V1', salePrice: 100000n, costPrice: 1n },
        { id: ids.v2, productId: ids.product, sku: `PX2-${run}`, skuKey: canonicalizeSku(`PX2-${run}`), combinationSignature: 'sig-x2', title: 'V2', salePrice: 30000n, costPrice: 1n },
      ],
    });
    await prisma.warehouse.create({ data: { id: ids.wh, code: `PXW-${run}`, name: 'W' } });
    await prisma.warehouseLocation.create({ data: { id: ids.loc, warehouseId: ids.wh, code: 'A', name: 'A' } });
    await prisma.shippingMethod.create({ data: { id: ids.ship, code: method, title: 'Shipping', amount: 50000n, policyRevision: 'p-v1' } });
  });

  async function clearInvoices() {
    assertIsolatedTestDatabase({ databaseUrl: process.env.DATABASE_URL, nodeEnvironment: process.env.NODE_ENV });
    await prisma.$executeRawUnsafe('TRUNCATE "OrderReturnRefund", "OrderReturnLine", "OrderReturn", "InvoicePdfRenderJobCommand", "InvoicePdfRenderJob", "InvoicePdfArtifact", "InvoicePdfStorageCapacity", "InvoicePublicationCommand", "InvoicePublicationEvent", "InvoicePublication", "InvoiceIssueCommand", "InvoiceDocumentEvent", "InvoiceDocumentLine", "InvoiceDocument", "InvoiceSeriesCounter", "InvoiceDraftCommand", "InvoiceDraftRevision", "InvoiceDraftLine", "InvoiceDraft", "InvoicePolicyCommand", "InvoicePolicyRevision"');
  }

  async function clean() {
    const promos = (await prisma.promotion.findMany({ where: { name: { startsWith: `payx-${run}` } }, select: { id: true } })).map((p) => p.id);
    const orderIds = (await prisma.order.findMany({ where: { customerId: { in: ids.customers } }, select: { id: true } })).map((o) => o.id);
    const paymentIds = (await prisma.payment.findMany({ where: { orderId: { in: orderIds } }, select: { id: true } })).map((p) => p.id);
    await prisma.$transaction(async (tx) => {
      // A deferred trigger keeps Payment.refundedAmount equal to the refund rows.
      await tx.payment.updateMany({ where: { id: { in: paymentIds } }, data: { refundedAmount: 0n } });
      await tx.refund.deleteMany({ where: { paymentId: { in: paymentIds } } });
      await tx.paymentTransition.deleteMany({ where: { paymentId: { in: paymentIds } } });
      await tx.payment.deleteMany({ where: { id: { in: paymentIds } } });
    });
    await clearInvoices();
    await prisma.promotionRedemption.deleteMany({ where: { OR: [{ promotionId: { in: promos } }, { orderId: { in: orderIds } }] } });
    await prisma.fulfillmentTransition.deleteMany({ where: { fulfillment: { orderId: { in: orderIds } } } });
    await prisma.fulfillment.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.stockReservation.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.shippingQuote.deleteMany({ where: { customerId: { in: ids.customers } } });
    await prisma.checkoutIdempotencyRecord.deleteMany({ where: { customerId: { in: ids.customers } } });
    await prisma.orderCommandIdempotencyRecord.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.outboxEvent.deleteMany({ where: { aggregateId: { in: [...orderIds, ...paymentIds] } } });
    await prisma.orderTransition.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.inventoryMovement.deleteMany({ where: { referenceType: 'order', referenceId: { in: orderIds } } });
    await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    await prisma.cart.deleteMany({ where: { customerId: { in: ids.customers } } });
    await prisma.inventoryBalance.deleteMany({ where: { warehouseId: ids.wh } });
    await prisma.coupon.deleteMany({ where: { promotionId: { in: promos } } });
    await prisma.promotionCommand.deleteMany({ where: { actorId: ids.staff } });
    await prisma.promotion.deleteMany({ where: { id: { in: promos } } });
  }

  beforeEach(async () => {
    await clean();
    for (const variantId of [ids.v1, ids.v2]) {
      await prisma.inventoryBalance.create({ data: { warehouseId: ids.wh, locationId: ids.loc, variantId, onHand: 100, reserved: 0, available: 100, version: 1 } });
    }
    provider.verify.mockImplementation(async (r) => ({ status: 'verified', referenceId: `REF-${r.correlationId}` }));
  });

  afterAll(async () => {
    await clean();
    await clearInvoices();
    await prisma.shippingMethod.deleteMany({ where: { id: ids.ship } });
    await prisma.warehouseLocation.deleteMany({ where: { warehouseId: ids.wh } });
    await prisma.warehouse.deleteMany({ where: { id: ids.wh } });
    await prisma.productVariant.deleteMany({ where: { productId: ids.product } });
    await prisma.product.deleteMany({ where: { id: ids.product } });
    await prisma.customer.deleteMany({ where: { id: { in: ids.customers } } });
    await prisma.auditLog.deleteMany({ where: { actorId: { in: [...ids.users, ids.staff] } } });
    await prisma.user.deleteMany({ where: { id: { in: [...ids.users, ids.staff] } } });
    await prisma.$disconnect();
  });

  it('C1/C2: verified discounted payment confirms the redemption once; duplicate callbacks change nothing', async () => {
    const { promotion, code } = await makePromo({ maxRedemptions: 5 });
    const order = await place(0, code); // 200000 - 20000 + 50000
    expect(order.total.amount).toBe('230000');
    const authority = await pay(0, order.id);
    const payment = await prisma.payment.findFirstOrThrow({ where: { orderId: order.id } });
    expect(payment.amount).toBe(230000n);

    const first = await verify(authority);
    expect(first.data.verification).toMatchObject({ outcome: 'VERIFIED', orderStatus: 'PAID', consumedReservations: 1 });
    expect(provider.verify).toHaveBeenLastCalledWith(expect.objectContaining({ amountMinorUnits: '230000' }));
    const paidOrder = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(paidOrder).toMatchObject({ status: 'PAID', subtotal: 200000n, discount: 20000n, shipping: 50000n, grandTotal: 230000n });
    expect(paidOrder.subtotal - paidOrder.discount + paidOrder.shipping).toBe(payment.amount);
    expect(await redemptionOf(order.id)).toMatchObject({ status: 'CONFIRMED', discountAmount: 20000n });
    expect((await promoOf(promotion.id)).usedCount).toBe(1);
    expect(await balance()).toMatchObject({ onHand: 98, reserved: 0 });

    const counts = async () => ({
      sales: await prisma.inventoryMovement.count({ where: { referenceId: order.id, type: 'SALE' } }),
      transitions: await prisma.orderTransition.count({ where: { orderId: order.id, to: 'PAID' } }),
      payTransitions: await prisma.paymentTransition.count({ where: { paymentId: payment.id } }),
      outbox: await prisma.outboxEvent.count({ where: { aggregateId: payment.id, topic: 'PAYMENT_VERIFIED' } }),
      confirmed: await prisma.promotionRedemption.count({ where: { orderId: order.id, status: 'CONFIRMED' } }),
    });
    const before = await counts();
    const replay = await Promise.all([verify(authority), verify(authority)]);
    for (const r of replay) expect(r.data.verification.outcome).toBe('REPLAY');
    expect(await counts()).toEqual(before);
    expect((await promoOf(promotion.id)).usedCount).toBe(1);
    expect(await balance()).toMatchObject({ onHand: 98 });
  });

  it('C3: an ambiguous provider answer keeps payment pending and the reservation intact; a later proof settles', async () => {
    const { promotion, code } = await makePromo({ maxRedemptions: 1 });
    const order = await place(0, code);
    const authority = await pay(0, order.id);
    provider.verify.mockResolvedValue({ status: 'unknown_result' });
    await verify(authority).catch(() => undefined);
    expect((await prisma.payment.findFirstOrThrow({ where: { orderId: order.id } })).status).toBe('PENDING');
    expect(await redemptionOf(order.id)).toMatchObject({ status: 'RESERVED' });

    // Even once the checkout window has passed, an order with a payment attempt is never expired.
    await prisma.order.update({ where: { id: order.id }, data: { reservationExpiresAt: new Date(Date.now() - 60_000) } });
    expect(await orders.expireAbandonedOrderAsSystem(order.id, `exp-${seq++}`)).toBe(false);
    expect(await redemptionOf(order.id)).toMatchObject({ status: 'RESERVED' });
    expect((await promoOf(promotion.id)).usedCount).toBe(1);
    expect(await balance()).toMatchObject({ reserved: 2 });

    provider.verify.mockImplementation(async (r) => ({ status: 'verified', referenceId: `REF-${r.correlationId}` }));
    expect((await verify(authority)).data.verification.outcome).toBe('VERIFIED');
    expect(await redemptionOf(order.id)).toMatchObject({ status: 'CONFIRMED' });
  });

  it('C4: definitive failure leaves the order open; cancel or expiry then releases capacity exactly once', async () => {
    const { promotion, code } = await makePromo({ maxRedemptions: 1 });
    const order = await place(0, code);
    const authority = await pay(0, order.id);
    provider.verify.mockResolvedValue({ status: 'failed', reason: 'amount' });
    expect((await verify(authority)).data.verification).toMatchObject({ status: 'FAILED', outcome: 'NOT_PAID' });
    // A failed attempt alone is not an authoritative release point.
    expect(await redemptionOf(order.id)).toMatchObject({ status: 'RESERVED' });
    expect((await promoOf(promotion.id)).usedCount).toBe(1);

    await orders.cancelAsCustomer(ids.users[0]!, order.id, { idempotencyKey: key(), requestId: `cx-${seq++}` });
    expect(await redemptionOf(order.id)).toMatchObject({ status: 'RELEASED' });
    expect((await promoOf(promotion.id)).usedCount).toBe(0);
    expect(await balance()).toMatchObject({ reserved: 0, onHand: 100 });
    await orders.cancelAsCustomer(ids.users[0]!, order.id, { idempotencyKey: key(), requestId: `cx-${seq++}` }).catch(() => undefined);
    expect((await promoOf(promotion.id)).usedCount).toBe(0);

    // The freed capacity is usable by someone else; and an abandoned checkout expires the same way.
    const next = await place(1, code);
    expect((await promoOf(promotion.id)).usedCount).toBe(1);
    await prisma.order.update({ where: { id: next.id }, data: { reservationExpiresAt: new Date(Date.now() - 60_000) } });
    expect(await orders.expireAbandonedOrderAsSystem(next.id, `exp-${seq++}`)).toBe(true);
    expect(await redemptionOf(next.id)).toMatchObject({ status: 'RELEASED', releaseReason: expect.any(String) });
    expect((await promoOf(promotion.id)).usedCount).toBe(0);
  });

  it('C6: a changed cart, price, or campaign after preview is rejected without order or redemption', async () => {
    const { promotion, code } = await makePromo({ maxRedemptions: 3 });
    const outcomes: string[] = [];
    const attempt = async (mutate: () => Promise<unknown>) => {
      await seedCart(0);
      await coupons.apply(ids.users[0]!, code, 'req');
      const quoteId = await preview(0);
      await mutate();
      const result = await checkout.createForUser(ids.users[0]!, { address, shippingQuoteId: quoteId }, key(), `co-${seq++}`).then(() => 'created', (e) => (e.getResponse() as { code: string }).code);
      outcomes.push(result);
      expect(result).not.toBe('created');
      expect(await prisma.order.count({ where: { customerId: ids.customers[0]! } })).toBe(0);
      expect(await prisma.promotionRedemption.count({ where: { promotionId: promotion.id } })).toBe(0);
      expect((await promoOf(promotion.id)).usedCount).toBe(0);
      return result;
    };
    expect(await attempt(async () => { await prisma.cartItem.updateMany({ where: { cart: { customerId: ids.customers[0]! } }, data: { quantity: 3 } }); await prisma.cart.update({ where: { customerId: ids.customers[0]! }, data: { version: { increment: 1 } } }); })).toBe('SHIPPING_QUOTE_CHANGED');
    expect(await attempt(() => admin.update(ids.staff, 'req', promotion.id, base({ percentBp: 2000 }), 1, key()))).toBe('QUOTE_CHANGED');
    expect(await attempt(async () => { await prisma.productVariant.update({ where: { id: ids.v1 }, data: { salePrice: 120000n } }); })).toBe('QUOTE_CHANGED');
    await prisma.productVariant.update({ where: { id: ids.v1 }, data: { salePrice: 100000n } });
    expect(outcomes).toEqual(['SHIPPING_QUOTE_CHANGED', 'QUOTE_CHANGED', 'QUOTE_CHANGED']);
  });

  it('D1-D3: partial then cumulative full refund keeps usage, restores capacity once, and replays idempotently', async () => {
    const { promotion, code } = await makePromo({ maxRedemptions: 3 });
    const order = await place(0, code); // paid 230000, discount 20000
    await verify(await pay(0, order.id));
    const payment = await prisma.payment.findFirstOrThrow({ where: { orderId: order.id } });

    const partialKey = key();
    const partialRef = `ZR-${run}-partial`;
    const partial = await refund(payment.id, 115000n, partialKey, partialRef);
    expect(partial.data.refund).toMatchObject({ refundedTotal: { amount: '115000' }, remainingRefundable: { amount: '115000' } });
    expect(await redemptionOf(order.id)).toMatchObject({ status: 'CONFIRMED', refundedDiscount: 10000n });
    expect((await promoOf(promotion.id)).usedCount).toBe(1);

    const replay = await refund(payment.id, 115000n, partialKey, partialRef);
    expect(replay.data.refund.refundId).toBe(partial.data.refund.refundId);
    expect(await prisma.refund.count({ where: { paymentId: payment.id } })).toBe(1);
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).refundedAmount).toBe(115000n);

    await refund(payment.id, 115000n);
    expect(await redemptionOf(order.id)).toMatchObject({ status: 'REFUNDED', refundedDiscount: 20000n });
    expect((await promoOf(promotion.id)).usedCount).toBe(0);
    expect((await prisma.coupon.findFirstOrThrow({ where: { promotionId: promotion.id } })).usedCount).toBe(0);

    await expect(refund(payment.id, 1n)).rejects.toBeDefined();
    expect((await promoOf(promotion.id)).usedCount).toBe(0);
    // History is retained, never rewritten.
    expect(await prisma.refund.count({ where: { paymentId: payment.id } })).toBe(2);
    expect(await prisma.promotionRedemption.count({ where: { orderId: order.id } })).toBe(1);
  });

  it('D4: concurrent refunds cannot exceed the paid amount or restore capacity twice', async () => {
    const { promotion, code } = await makePromo({ maxRedemptions: 3 });
    const order = await place(0, code);
    await verify(await pay(0, order.id));
    const payment = await prisma.payment.findFirstOrThrow({ where: { orderId: order.id } });
    const settled = await Promise.allSettled([refund(payment.id, 230000n), refund(payment.id, 230000n)]);
    expect(settled.filter((s) => s.status === 'fulfilled')).toHaveLength(1);
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).refundedAmount).toBe(230000n);
    expect((await promoOf(promotion.id)).usedCount).toBe(0);
    expect(await redemptionOf(order.id)).toMatchObject({ status: 'REFUNDED' });
  });

  it('D5: refunding after the campaign ended or was disabled restores usage but never reactivates it', async () => {
    const { promotion, code } = await makePromo({ maxRedemptions: 3 });
    const order = await place(0, code);
    await verify(await pay(0, order.id));
    const endsAt = new Date(Date.now() - 3_600_000);
    await prisma.promotion.update({ where: { id: promotion.id }, data: { isActive: false, endsAt } });
    const payment = await prisma.payment.findFirstOrThrow({ where: { orderId: order.id } });
    await refund(payment.id, 230000n);
    const after = await promoOf(promotion.id);
    expect(after).toMatchObject({ usedCount: 0, isActive: false });
    expect(after.endsAt?.getTime()).toBe(endsAt.getTime());
    await seedCart(1);
    await expect(coupons.apply(ids.users[1]!, code, 'req')).rejects.toMatchObject({ response: { code: expect.stringMatching(/COUPON_(INACTIVE|EXPIRED)/) } });
  });

  it('D6: cancellation releases only reservations; a payment settled after cancel and its refund never move capacity', async () => {
    const { promotion, code } = await makePromo({ maxRedemptions: 3 });
    const order = await place(0, code);
    const authority = await pay(0, order.id);
    await orders.cancelAsCustomer(ids.users[0]!, order.id, { idempotencyKey: key(), requestId: `cx-${seq++}` });
    expect(await redemptionOf(order.id)).toMatchObject({ status: 'RELEASED' });
    expect((await promoOf(promotion.id)).usedCount).toBe(0);

    const late = await verify(authority);
    expect(late.data.verification.outcome).toBe('VERIFIED_AFTER_CANCELLED');
    expect(await redemptionOf(order.id)).toMatchObject({ status: 'RELEASED' });
    const payment = await prisma.payment.findFirstOrThrow({ where: { orderId: order.id } });
    await refund(payment.id, payment.amount);
    expect((await promoOf(promotion.id)).usedCount).toBe(0);
    expect(await redemptionOf(order.id)).toMatchObject({ status: 'RELEASED' });

    // A confirmed (paid) redemption is not released by a later cancel attempt.
    const paid = await place(1, code);
    await verify(await pay(1, paid.id));
    await orders.cancelAsCustomer(ids.users[1]!, paid.id, { idempotencyKey: key(), requestId: `cx-${seq++}` }).catch(() => undefined);
    expect(await redemptionOf(paid.id)).toMatchObject({ status: 'CONFIRMED' });
    expect((await promoOf(promotion.id)).usedCount).toBe(1);
  });

  it('E: order, payment and issued invoice totals reconcile; an unrepresentable free-shipping invoice fails closed', async () => {
    const previous = await policies.current();
    await policies.update(ids.staff, 'req', { expectedVersion: previous?.version ?? null, sellerName: 'Isolated seller', sellerAddress: 'Isolated seller address', sellerContact: 'Public test contact',
      taxTreatment: 'INCLUSIVE', taxRateBps: 1000, exemptionReason: null, discountCapBps: 10000, shippingTaxable: false, isActive: true, reason: 'Isolated accepted test policy' }, key());
    const free = await makePromo({ kind: 'FREE_SHIPPING', percentBp: null, amount: null });
    const pct = await makePromo({ percentBp: 1500 });
    const cases = [
      { label: 'percentage', order: await place(0, pct.code) },
      // Goods (30000) are cheaper than the shipping discount (50000): discount exceeds subtotal.
      { label: 'free-shipping', order: await place(1, free.code, 1, ids.v2) },
    ];
    {
      const { order } = cases[0]!;
      const row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(row.subtotal - row.discount + row.shipping).toBe(row.grandTotal);
      const authority = await pay(0, order.id);
      expect((await prisma.payment.findFirstOrThrow({ where: { orderId: order.id } })).amount).toBe(row.grandTotal);
      const created = await drafts.fromOrder(ids.staff, 'req', order.id, { expectedOrderVersion: row.version, note: null }, key());
      expect(created.draft.sourceTermsMatch).toBe(true);
      expect(created.draft.quote!.total.amount).toBe(row.grandTotal.toString());
      const issued = await invoices.issue(ids.staff, 'req', created.draft.id, { expectedVersion: created.draft.version, expectedOrderVersion: row.version }, key());
      expect(issued.document.quote.total.amount).toBe(row.grandTotal.toString());
      expect(issued.document.quote.discount.amount).toBe(row.discount.toString());
      await verify(authority);
    }
    {
      // Documented limitation: the immutable invoice evidence requires document discount == order discount and
      // cannot express a free-shipping discount larger than the goods. Fail closed with a deterministic 4xx.
      const { order } = cases[1]!;
      const row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(row.discount).toBe(50000n);
      expect(row.subtotal - row.discount + row.shipping).toBe(row.grandTotal);
      const failure = await drafts.fromOrder(ids.staff, 'req', order.id, { expectedOrderVersion: row.version, note: null }, key()).then(() => null, (e) => e);
      expect(failure?.getStatus?.()).toBeGreaterThanOrEqual(400);
      expect(failure?.getStatus?.()).toBeLessThan(500);
      expect(await prisma.invoiceDocument.count({ where: { orderId: order.id } })).toBe(0);
    }
  });

  it('C5: concurrent checkouts on a one-use coupon leave exactly one reservation and non-negative capacity', async () => {
    const { promotion, code } = await makePromo({ maxRedemptions: 1 });
    const quotes: string[] = [];
    for (const i of [0, 1, 2]) {
      await seedCart(i, 1);
      await coupons.apply(ids.users[i]!, code, 'req');
      quotes.push(await preview(i));
    }
    const settled = await Promise.allSettled([0, 1, 2].map((i) => checkout.createForUser(ids.users[i]!, { address, shippingQuoteId: quotes[i]! }, key(), `co-${seq++}`)));
    expect(settled.filter((s) => s.status === 'fulfilled')).toHaveLength(1);
    for (const s of settled) {
      if (s.status === 'rejected') expect(s.reason.getStatus?.()).toBe(409);
    }
    expect((await promoOf(promotion.id)).usedCount).toBe(1);
    expect(await prisma.promotionRedemption.count({ where: { promotionId: promotion.id } })).toBe(1);
    expect(await prisma.stockReservation.count({ where: { order: { customerId: { in: ids.customers } }, status: 'ACTIVE' } })).toBe(1);
    expect(await prisma.order.count({ where: { customerId: { in: ids.customers } } })).toBe(1);
  });
});
