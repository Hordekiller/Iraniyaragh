import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../database/prisma.service';
import { assertIsolatedTestDatabase } from '../../test/database-url.guard';
import { AuditLogService } from '../audit/audit-log.service';
import { EMPTY_AXIS_SIGNATURE, canonicalizeSku } from '../catalog/variant-identifiers';
import { InventoryService } from '../inventory/inventory.service';
import { StaffOrderService } from '../orders/staff-order.service';
import { AdminPaymentRefundService } from '../payments/admin-payment-refund.service';
import { civilKey, computeReturnDeadline, tehranCivilDate } from './return-window';
import { ReturnsService } from './returns.service';

/**
 * Real commands on a disposable PostgreSQL database (name must end in `_test`).
 * The fixture inserts issued invoices with `session_replication_role = replica`
 * because issuing a real invoice needs a full policy/draft/counter chain that is
 * irrelevant here; production code never uses that role.
 */
describe.sequential('Order returns: window, amounts, stock, refunds and database guards', () => {
  const prisma = new PrismaService();
  const audit = new AuditLogService(prisma);
  const inventory = new InventoryService(prisma, audit);
  const refunds = new AdminPaymentRefundService(prisma, audit);
  const service = new ReturnsService(prisma, audit, inventory, refunds);
  const staffOrders = new StaffOrderService(prisma, audit);

  const run = randomUUID().replaceAll('-', '');
  const requestId = `returns-it-${run}`;
  let counter = 0;
  const next = () => (counter += 1);
  const unique = () => `${run}-${next()}`;

  let actorId = '';
  let productId = '';
  const variantIds: string[] = [];
  let warehouseId = '';
  let locationId = '';
  const customers: string[] = [];
  const orderIds: string[] = [];
  const shippingCodes: string[] = [];
  let connected = false;

  const ctx = (key = `ret-${unique()}`) => ({ actorId, requestId: `${requestId}-${next()}`, idempotencyKey: key });
  const code = (value: string) => expect.objectContaining({ response: expect.objectContaining({ code: value }) });
  const reasonOf = (value: string) => expect.objectContaining({ response: expect.objectContaining({ details: { reason: value } }) });
  const DAY = 86_400_000;

  async function asReplica<T>(work: (tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0]) => Promise<T>): Promise<T> {
    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL session_replication_role = replica`;
      return work(tx);
    });
  }

  beforeAll(async () => {
    assertIsolatedTestDatabase({ databaseUrl: process.env.DATABASE_URL, nodeEnvironment: process.env.NODE_ENV });
    await prisma.$connect();
    connected = true;
    actorId = (await prisma.user.create({ data: { email: `returns-${run}@example.test`, status: 'ACTIVE' } })).id;
    // Returns are OFF by default; the fixture switches them on like an administrator would.
    await prisma.storefrontFeatureFlag.upsert({ where: { key: 'order-returns' }, create: { key: 'order-returns', enabled: true, version: 1 }, update: { enabled: true } });
    productId = (await prisma.product.create({ data: { name: 'Isolated returns product', slug: `isolated-returns-${run}`, status: 'ACTIVE' } })).id;
    for (const [index, price] of [1000n, 700n].entries()) {
      const sku = `RET-IT-${run}-${index}`;
      variantIds.push((await prisma.productVariant.create({ data: {
        productId, sku, skuKey: canonicalizeSku(sku), combinationSignature: `${EMPTY_AXIS_SIGNATURE}-${index}`, salePrice: price, costPrice: 100n, status: 'ACTIVE', isActive: true,
      } })).id);
    }
    warehouseId = (await prisma.warehouse.create({ data: { code: `RT-${run}`, name: 'Isolated returns warehouse' } })).id;
    locationId = (await prisma.warehouseLocation.create({ data: { warehouseId, code: 'RET-IT', name: 'Isolated returns shelf' } })).id;
    for (const variantId of variantIds) await prisma.inventoryBalance.create({ data: { variantId, warehouseId, locationId, onHand: 500, reserved: 0, available: 500 } });
  });

  afterAll(async () => {
    if (!connected) return;
    await asReplica(async (tx) => {
      await tx.orderReturnRefund.deleteMany({ where: { orderReturn: { orderId: { in: orderIds } } } });
      await tx.orderReturnLine.deleteMany({ where: { orderReturn: { orderId: { in: orderIds } } } });
      await tx.orderReturn.deleteMany({ where: { orderId: { in: orderIds } } });
      await tx.$executeRaw`DELETE FROM "InvoiceDocument" WHERE "orderId" = ANY(${orderIds})`;
      await tx.$executeRaw`DELETE FROM "DoorOrder" WHERE "id" = ANY(${orderIds})`;
      await tx.refund.deleteMany({ where: { payment: { orderId: { in: orderIds } } } });
      await tx.paymentTransition.deleteMany({ where: { payment: { orderId: { in: orderIds } } } });
      await tx.payment.deleteMany({ where: { orderId: { in: orderIds } } });
      await tx.outboxEvent.deleteMany({ where: { aggregateId: { in: orderIds } } });
    });
    await prisma.fulfillmentTransition.deleteMany({ where: { fulfillment: { orderId: { in: orderIds } } } });
    await prisma.fulfillment.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.inventoryMovement.deleteMany({ where: { variantId: { in: variantIds } } });
    await prisma.stockReservation.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.orderCommandIdempotencyRecord.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.orderTransition.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.staffOrderCommandRecord.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    await prisma.customer.deleteMany({ where: { id: { in: customers } } });
    await prisma.inventoryBalance.deleteMany({ where: { variantId: { in: variantIds } } });
    await prisma.productVariant.deleteMany({ where: { id: { in: variantIds } } });
    await prisma.product.delete({ where: { id: productId } });
    await prisma.warehouseLocation.delete({ where: { id: locationId } });
    await prisma.warehouse.delete({ where: { id: warehouseId } });
    await prisma.shippingMethod.deleteMany({ where: { code: { in: shippingCodes } } });
    await prisma.returnHoliday.deleteMany({ where: { label: { startsWith: `it-${run}` } } });
    await prisma.storefrontFeatureFlag.deleteMany({ where: { key: 'order-returns' } });
    await prisma.auditLog.deleteMany({ where: { requestId: { startsWith: requestId } } });
    await prisma.user.delete({ where: { id: actorId } });
    await prisma.$disconnect();
  });

  type Fixture = {
    orderId: string;
    itemIds: string[];
    paymentId: string;
    grandTotal: bigint;
  };

  /**
   * A paid order built through the real staff-order command, then settled:
   * order PAID, one PAID payment equal to the grand total, one issued invoice.
   */
  async function paidOrder(options: {
    lines?: Array<{ variant: 0 | 1; quantity: number }>;
    discount?: bigint;
    shipping?: bigint;
    method?: string; // order.shippingMethod; defaults to the staff in-person policy code
    issuedAt?: Date;
    invoice?: boolean;
    door?: boolean;
  } = {}): Promise<Fixture> {
    const suffix = (BigInt(`0x${run.slice(0, 12)}`) + BigInt(next())) % 1_000_000_000n;
    const customerId = (await prisma.customer.create({ data: { mobile: `+989${suffix.toString().padStart(9, '0')}` } })).id;
    customers.push(customerId);
    const lines = options.lines ?? [{ variant: 0, quantity: 3 }];
    const created = await staffOrders.create({ ...ctx(), payload: { customerId, lines: lines.map((line) => ({ variantId: variantIds[line.variant]!, quantity: line.quantity })), address: {
      provinceCode: 'THR', city: 'Isolated test city', address: 'Isolated test address', postalCode: '1234567890', recipient: 'Isolated test', mobile: '+989120000000',
    } } });
    const orderId = created.data.order.id;
    orderIds.push(orderId);
    const items = await prisma.orderItem.findMany({ where: { orderId }, orderBy: { ordinal: 'asc' } });
    const subtotal = items.reduce((sum, item) => sum + item.total, 0n);
    const discount = options.discount ?? 0n;
    const shipping = options.shipping ?? 0n;
    const grandTotal = subtotal - discount + shipping;
    await prisma.order.update({ where: { id: orderId }, data: {
      status: 'PAID', discount, shipping, grandTotal,
      ...(options.method ? { shippingMethod: options.method, shippingMethodTitle: options.method } : {}),
    } });
    const payment = await prisma.payment.create({ data: {
      orderId, provider: 'zarinpal', amount: grandTotal, status: 'PAID', idempotencyKey: `pay-${unique()}`, idempotencyFingerprint: 'f'.repeat(64),
    } });
    if (options.invoice !== false) {
      const issuedAt = options.issuedAt ?? new Date();
      const n = next();
      await asReplica(async (tx) => {
        await tx.$executeRaw`INSERT INTO "InvoiceDocument"
          ("id","draftId","draftVersion","orderId","orderVersion","customerId","policyRevisionId","series","period","sequence","number",
           "subtotal","discount","shipping","netAmount","tax","grandTotal","snapshot","payloadHash","issuedById","issuedAt")
          VALUES (${`inv-${run}-${n}`}, ${`draft-${run}-${n}`}, 1, ${orderId}, 1, ${customerId}, ${`policy-${run}`}, 'SALE', 3000, ${n}, ${`IT-${run}-${n}`},
           ${subtotal}, ${discount}, ${shipping}, ${grandTotal}, 0, ${grandTotal}, '{}'::jsonb, ${'a'.repeat(64)}, ${actorId}, ${issuedAt})`;
      });
    }
    if (options.door) await asReplica(async (tx) => { await tx.$executeRaw`INSERT INTO "DoorOrder" ("id","updatedAt") VALUES (${orderId}, now())`; });
    return { orderId, itemIds: items.map((item) => item.id), paymentId: payment.id, grandTotal };
  }

  const stockOf = async (variantId: string) =>
    (await prisma.inventoryBalance.findUniqueOrThrow({ where: { warehouseId_locationId_variantId: { warehouseId, locationId, variantId } } })).onHand;
  const restock = (orderItemId: string, quantity: number) => ({ orderItemId, quantity, disposition: 'RESTOCK' as const, warehouseId, locationId });
  const input = (lines: ReturnType<typeof restock>[] | Array<{ orderItemId: string; quantity: number; disposition: 'DAMAGED' | 'NOT_RETURNED' | 'RESTOCK'; warehouseId?: string; locationId?: string }>, reason = 'Customer changed their mind') => ({ reason, lines });

  // ---------------------------------------------------------------------------
  describe('eligibility', () => {
    it('reports the window and returnable quantities of a paid in-person order', async () => {
      const order = await paidOrder();
      const { data } = await service.eligibility(order.orderId);
      expect(data).toMatchObject({ eligible: true, reason: null, windowKind: 'IN_PERSON', policyRevision: 'returns-v1' });
      expect(data.lines).toEqual([expect.objectContaining({ orderedQuantity: 3, returnedQuantity: 0, remainingQuantity: 3, netLineAmount: { amount: '3000', currency: 'IRR' } })]);
      expect(new Date(data.deadlineAt!).getTime()).toBeGreaterThan(Date.now());
    });

    it('uses the owner-approved 2 business days after the invoice day, honouring editable holidays', async () => {
      const issuedAt = new Date();
      const order = await paidOrder({ issuedAt });
      const plain = computeReturnDeadline({ kind: 'IN_PERSON', anchor: issuedAt, holidays: new Set() });
      expect((await service.eligibility(order.orderId)).data.deadlineAt).toBe(plain.toISOString());

      // Make the first business day after day zero a holiday: the deadline must move.
      const dayAfter = new Date(issuedAt.getTime() + DAY);
      const holidayKey = civilKey(tehranCivilDate(dayAfter));
      const added = await service.addHoliday({ dateKey: holidayKey, label: `it-${run}-holiday` }, actorId, ctx().requestId);
      try {
        const moved = computeReturnDeadline({ kind: 'IN_PERSON', anchor: issuedAt, holidays: new Set([holidayKey]) });
        expect((await service.eligibility(order.orderId)).data.deadlineAt).toBe(moved.toISOString());
        await expect(service.addHoliday({ dateKey: holidayKey, label: `it-${run}-dup` }, actorId, ctx().requestId)).rejects.toEqual(code('RETURN_HOLIDAY_EXISTS'));
      } finally {
        await service.removeHoliday(added.data.id, actorId, ctx().requestId);
      }
      expect((await service.eligibility(order.orderId)).data.deadlineAt).toBe(plain.toISOString());
    });

    it('closes an in-person window after the deadline', async () => {
      const order = await paidOrder({ issuedAt: new Date(Date.now() - 30 * DAY) });
      expect((await service.eligibility(order.orderId)).data).toMatchObject({ eligible: false, reason: 'WINDOW_CLOSED' });
      await expect(service.create(order.orderId, input([restock(order.itemIds[0]!, 1)]), ctx())).rejects.toEqual(reasonOf('WINDOW_CLOSED'));
    });

    it('gives shipped orders 7 calendar days, through the end of the last day', async () => {
      const code = `it-ship-${run}`;
      shippingCodes.push(code);
      await prisma.shippingMethod.create({ data: { code, title: 'Isolated courier', amount: 0n, policyRevision: 'it', returnWindowKind: 'DELIVERY' } });
      const open = await paidOrder({ method: code, issuedAt: new Date(Date.now() - 5 * DAY) });
      const closed = await paidOrder({ method: code, issuedAt: new Date(Date.now() - 9 * DAY) });
      expect((await service.eligibility(open.orderId)).data).toMatchObject({ eligible: true, windowKind: 'DELIVERY' });
      expect((await service.eligibility(closed.orderId)).data).toMatchObject({ eligible: false, reason: 'WINDOW_CLOSED' });
    });

    it('blocks an unclassified or unknown shipping method until staff classify it', async () => {
      const code = `it-unclassified-${run}`;
      shippingCodes.push(code);
      await prisma.shippingMethod.create({ data: { code, title: 'Unclassified', amount: 0n, policyRevision: 'it' } });
      const order = await paidOrder({ method: code });
      expect((await service.eligibility(order.orderId)).data).toMatchObject({ eligible: false, reason: 'METHOD_UNCLASSIFIED' });
      await prisma.shippingMethod.update({ where: { code }, data: { returnWindowKind: 'DELIVERY' } });
      expect((await service.eligibility(order.orderId)).data.eligible).toBe(true);
      const unknown = await paidOrder({ method: `it-missing-${run}` });
      expect((await service.eligibility(unknown.orderId)).data.reason).toBe('METHOD_UNCLASSIFIED');
    });

    it('refuses orders that are unpaid, have no issued invoice, or are custom doors', async () => {
      const noInvoice = await paidOrder({ invoice: false });
      expect((await service.eligibility(noInvoice.orderId)).data.reason).toBe('NO_ISSUED_INVOICE');
      const door = await paidOrder({ door: true });
      expect((await service.eligibility(door.orderId)).data.reason).toBe('CUSTOM_DOOR_EXCLUDED');
      const unpaid = await paidOrder();
      await prisma.order.update({ where: { id: unpaid.orderId }, data: { status: 'PENDING_PAYMENT' } });
      expect((await service.eligibility(unpaid.orderId)).data.reason).toBe('ORDER_NOT_PAID');
      await expect(service.create(door.orderId, input([restock(door.itemIds[0]!, 1)]), ctx())).rejects.toEqual(reasonOf('CUSTOM_DOOR_EXCLUDED'));
    });

    it('refuses an order whose payment does not reconcile with its total', async () => {
      // The database already forbids an inconsistent order total (Order_checkout_money),
      // so the realistic mismatch is a captured payment that differs from the order.
      const order = await paidOrder();
      await prisma.payment.update({ where: { id: order.paymentId }, data: { amount: order.grandTotal + 1n } });
      expect((await service.eligibility(order.orderId)).data.reason).toBe('AMOUNTS_DO_NOT_RECONCILE');

      const split = await paidOrder();
      await prisma.payment.create({ data: { orderId: split.orderId, provider: 'zarinpal', amount: 1n, status: 'PAID', idempotencyKey: `pay-${unique()}`, idempotencyFingerprint: 'e'.repeat(64) } });
      expect((await service.eligibility(split.orderId)).data.reason).toBe('AMOUNTS_DO_NOT_RECONCILE');
    });

    it('answers 404 for an unknown order', async () => {
      await expect(service.eligibility('missing-order')).rejects.toEqual(code('RETURN_NOT_FOUND'));
    });
  });

  // ---------------------------------------------------------------------------
  describe('recording a return', () => {
    it('restocks, refunds exactly the paid amount and closes the order on a full return', async () => {
      const order = await paidOrder();
      const before = await stockOf(variantIds[0]!);
      const result = await service.create(order.orderId, input([restock(order.itemIds[0]!, 3)]), ctx());
      expect(result.data).toMatchObject({ sequence: 1, windowKind: 'IN_PERSON', refundDue: { amount: '3000' }, merchandiseRefund: { amount: '3000' }, shippingRefund: { amount: '0' } });
      expect(result.data.number).toMatch(/-R1$/u);
      expect(await stockOf(variantIds[0]!)).toBe(before + 3);
      const movement = await prisma.inventoryMovement.findUniqueOrThrow({ where: { id: result.data.lines[0]!.movementId! } });
      expect(movement).toMatchObject({ type: 'RETURN_IN', quantity: 3, referenceType: 'order-return', referenceId: result.data.id });
      expect((await prisma.order.findUniqueOrThrow({ where: { id: order.orderId } })).status).toBe('RETURNED');
      expect(await prisma.auditLog.count({ where: { action: 'order.return.recorded', entityId: order.orderId } })).toBe(1);
      expect((await service.eligibility(order.orderId)).data.reason).toBe('FULLY_RETURNED');
    });

    it('supports partial returns and never lets cumulative quantity exceed what was sold', async () => {
      const order = await paidOrder({ lines: [{ variant: 0, quantity: 3 }, { variant: 1, quantity: 2 }] });
      const [a, b] = order.itemIds as [string, string];
      const first = await service.create(order.orderId, input([restock(a, 2)]), ctx());
      expect(first.data.refundDue.amount).toBe('2000');
      expect((await prisma.order.findUniqueOrThrow({ where: { id: order.orderId } })).status).toBe('PAID');
      await expect(service.create(order.orderId, input([restock(a, 2)]), ctx())).rejects.toEqual(code('RETURN_QUANTITY_EXCEEDED'));
      const second = await service.create(order.orderId, input([restock(a, 1), restock(b, 2)]), ctx());
      expect(second.data).toMatchObject({ sequence: 2, refundDue: { amount: '2400' } });
      expect((await prisma.order.findUniqueOrThrow({ where: { id: order.orderId } })).status).toBe('RETURNED');
    });

    it('subtracts each line\'s share of the discount and refunds shipping only when everything is returned', async () => {
      const order = await paidOrder({ lines: [{ variant: 0, quantity: 1 }, { variant: 1, quantity: 1 }], discount: 100n, shipping: 50n });
      const [a, b] = order.itemIds as [string, string];
      // subtotal 1700, discount 100 -> shares 59 and 41 (largest remainder); net 941 and 659.
      const partial = await service.create(order.orderId, input([restock(a, 1)]), ctx());
      expect(partial.data).toMatchObject({ merchandiseRefund: { amount: '941' }, shippingRefund: { amount: '0' }, refundDue: { amount: '941' } });
      const final = await service.create(order.orderId, input([restock(b, 1)]), ctx());
      expect(final.data).toMatchObject({ merchandiseRefund: { amount: '659' }, shippingRefund: { amount: '50' }, refundDue: { amount: '709' } });
      // Over the whole order the customer is owed exactly what they paid.
      expect(BigInt(partial.data.refundDue.amount) + BigInt(final.data.refundDue.amount)).toBe(order.grandTotal);
    });

    it('moves stock only for restocked lines', async () => {
      const order = await paidOrder({ lines: [{ variant: 0, quantity: 1 }, { variant: 1, quantity: 1 }] });
      const [a, b] = order.itemIds as [string, string];
      const before = [await stockOf(variantIds[0]!), await stockOf(variantIds[1]!)];
      const result = await service.create(order.orderId, input([restock(a, 1), { orderItemId: b, quantity: 1, disposition: 'DAMAGED' }]), ctx());
      expect(result.data.lines.find((line) => line.orderItemId === a)!.movementId).not.toBeNull();
      expect(result.data.lines.find((line) => line.orderItemId === b)!.movementId).toBeNull();
      expect(await stockOf(variantIds[0]!)).toBe(before[0]! + 1);
      expect(await stockOf(variantIds[1]!)).toBe(before[1]!);
    });

    it('validates the input instead of guessing', async () => {
      const order = await paidOrder();
      const item = order.itemIds[0]!;
      const bad = async (value: unknown) => expect(service.create(order.orderId, value as never, ctx())).rejects.toEqual(code('RETURN_INPUT_INVALID'));
      await bad({ reason: '', lines: [restock(item, 1)] });
      await bad({ reason: 'x', lines: [] });
      await bad({ reason: 'x', lines: [{ orderItemId: item, quantity: 0, disposition: 'RESTOCK', warehouseId, locationId }] });
      await bad({ reason: 'x', lines: [{ orderItemId: item, quantity: 1, disposition: 'RESTOCK' }] }); // no destination
      await bad({ reason: 'x', lines: [{ orderItemId: item, quantity: 1, disposition: 'DAMAGED', warehouseId, locationId }] }); // destination on non-restock
      await bad({ reason: 'x', lines: [{ orderItemId: item, quantity: 1, disposition: 'WHATEVER' }] });
      await bad({ reason: 'x', lines: [restock(item, 1), restock(item, 1)] }); // duplicate line
      await bad({ reason: 'x', lines: [restock('not-an-item-of-this-order', 1)] });
      await bad({ reason: 'x', lines: [{ ...restock(item, 1), locationId: 'missing-location' }] });
      expect(await prisma.orderReturn.count({ where: { orderId: order.orderId } })).toBe(0);
    });

    it('is idempotent: a retry returns the same return and moves stock once', async () => {
      const order = await paidOrder();
      const before = await stockOf(variantIds[0]!);
      const context = ctx();
      const body = input([restock(order.itemIds[0]!, 1)]);
      const first = await service.create(order.orderId, body, context);
      const replay = await service.create(order.orderId, body, context);
      expect(replay.data.id).toBe(first.data.id);
      expect(await prisma.orderReturn.count({ where: { orderId: order.orderId } })).toBe(1);
      expect(await stockOf(variantIds[0]!)).toBe(before + 1);
      await expect(service.create(order.orderId, input([restock(order.itemIds[0]!, 2)]), context)).rejects.toEqual(code('RETURN_IDEMPOTENCY_CONFLICT'));
    });

    it('lets only one of two concurrent returns of the same units succeed', async () => {
      const order = await paidOrder();
      const before = await stockOf(variantIds[0]!);
      const outcomes = await Promise.allSettled([
        service.create(order.orderId, input([restock(order.itemIds[0]!, 3)]), ctx()),
        service.create(order.orderId, input([restock(order.itemIds[0]!, 3)]), ctx()),
      ]);
      expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
      expect(await prisma.orderReturn.count({ where: { orderId: order.orderId } })).toBe(1);
      expect(await stockOf(variantIds[0]!)).toBe(before + 3);
    });

    it('lists and reads returns', async () => {
      const order = await paidOrder();
      const created = await service.create(order.orderId, input([restock(order.itemIds[0]!, 1)]), ctx());
      expect((await service.get(created.data.id)).data.id).toBe(created.data.id);
      const listed = await service.list({ page: 1, perPage: 10, orderNumber: created.data.orderNumber });
      expect(listed.data.items.map((row) => row.id)).toEqual([created.data.id]);
      await expect(service.get('missing')).rejects.toEqual(code('RETURN_NOT_FOUND'));
    });
  });

  // ---------------------------------------------------------------------------
  describe('settling a return with a manual gateway refund', () => {
    const refundBody = (amount: string, reference = `ZP-${unique()}`) => ({ amountMinorUnits: amount, gatewayReferenceId: reference, reason: 'Return settled' });

    it('links the refund, tracks what is still due and moves the payment to REFUNDED', async () => {
      const order = await paidOrder();
      const created = await service.create(order.orderId, input([restock(order.itemIds[0]!, 3)]), ctx());
      const partial = await service.recordRefund(created.data.id, null, refundBody('1000'), ctx());
      expect(partial.data).toMatchObject({ paymentStatus: 'PARTIALLY_REFUNDED', orderReturn: { refunded: { amount: '1000' }, refundRemaining: { amount: '2000' } } });
      const rest = await service.recordRefund(created.data.id, null, refundBody('2000'), ctx());
      expect(rest.data).toMatchObject({ paymentStatus: 'REFUNDED', orderReturn: { refundRemaining: { amount: '0' } } });
      expect((await prisma.payment.findUniqueOrThrow({ where: { id: order.paymentId } })).refundedAmount).toBe(3000n);
    });

    it('rejects a refund above what the return is due even if the payment has room', async () => {
      const order = await paidOrder({ lines: [{ variant: 0, quantity: 3 }] });
      const created = await service.create(order.orderId, input([restock(order.itemIds[0]!, 1)]), ctx());
      await expect(service.recordRefund(created.data.id, null, refundBody('1001'), ctx())).rejects.toEqual(code('RETURN_REFUND_EXCEEDED'));
      expect(await prisma.refund.count({ where: { paymentId: order.paymentId } })).toBe(0);
    });

    it('is idempotent with the same key and refuses a different payload under it', async () => {
      const order = await paidOrder();
      const created = await service.create(order.orderId, input([restock(order.itemIds[0]!, 3)]), ctx());
      const context = ctx();
      const body = refundBody('500');
      const first = await service.recordRefund(created.data.id, null, body, context);
      const replay = await service.recordRefund(created.data.id, null, body, context);
      expect(replay.data.refundId).toBe(first.data.refundId);
      expect(await prisma.refund.count({ where: { paymentId: order.paymentId } })).toBe(1);
      await expect(service.recordRefund(created.data.id, null, refundBody('600', body.gatewayReferenceId), context)).rejects.toEqual(code('IDEMPOTENCY_CONFLICT'));
    });

    it('answers 404 for an unknown return', async () => {
      await expect(service.recordRefund('missing', null, refundBody('1'), ctx())).rejects.toEqual(code('RETURN_NOT_FOUND'));
    });
  });

  // ---------------------------------------------------------------------------
  describe('database guards hold even when the service is bypassed', () => {
    it('keeps returns append-only', async () => {
      const order = await paidOrder();
      const created = await service.create(order.orderId, input([restock(order.itemIds[0]!, 1)]), ctx());
      await expect(prisma.$executeRaw`UPDATE "OrderReturn" SET "reason" = 'edited' WHERE "id" = ${created.data.id}`).rejects.toThrow(/append-only/u);
      await expect(prisma.$executeRaw`DELETE FROM "OrderReturnLine" WHERE "returnId" = ${created.data.id}`).rejects.toThrow(/append-only/u);
    });

    it('rejects returned quantity above what was sold', async () => {
      const order = await paidOrder();
      const created = await service.create(order.orderId, input([restock(order.itemIds[0]!, 2)]), ctx());
      await expect(prisma.$executeRaw`INSERT INTO "OrderReturnLine" ("id","returnId","orderItemId","quantity","disposition","unitPrice","refundAmount")
        VALUES (${`line-${unique()}`}, ${created.data.id}, ${order.itemIds[0]!}, 2, 'DAMAGED', 1000, 2000)`).rejects.toThrow(/exceed/u);
    });

    it('rejects a return recorded outside its window or without lines', async () => {
      const order = await paidOrder();
      const invoice = await prisma.invoiceDocument.findUniqueOrThrow({ where: { orderId: order.orderId } });
      const insert = (returnedAt: Date, deadlineAt: Date) => prisma.$transaction(async (tx) => {
        await tx.$executeRaw`INSERT INTO "OrderReturn" ("id","orderId","sequence","windowKind","policyRevision","invoiceId","invoiceIssuedAt","deadlineAt","returnedAt",
          "merchandiseRefund","shippingRefund","refundDue","reason","actorId","requestId")
          VALUES (${`ret-${unique()}`}, ${order.orderId}, 99, 'IN_PERSON', 'returns-v1', ${invoice.id}, ${invoice.issuedAt}, ${deadlineAt}, ${returnedAt}, 0, 0, 0, 'bypass', ${actorId}, 'bypass')`;
      });
      await expect(insert(new Date(Date.now() + 2 * DAY), new Date(Date.now() + DAY))).rejects.toThrow(/OrderReturn_inside_window/u);
      // Inside the window but with no lines: the deferred total guard refuses to commit.
      await expect(insert(new Date(), new Date(Date.now() + DAY))).rejects.toThrow(/lines/u);
    });

    it('rejects a return for an unpaid order', async () => {
      const order = await paidOrder();
      const invoice = await prisma.invoiceDocument.findUniqueOrThrow({ where: { orderId: order.orderId } });
      await prisma.order.update({ where: { id: order.orderId }, data: { status: 'PENDING_PAYMENT' } });
      await expect(prisma.$executeRaw`INSERT INTO "OrderReturn" ("id","orderId","sequence","windowKind","policyRevision","invoiceId","invoiceIssuedAt","deadlineAt","returnedAt",
        "merchandiseRefund","shippingRefund","refundDue","reason","actorId","requestId")
        VALUES (${`ret-${unique()}`}, ${order.orderId}, 98, 'IN_PERSON', 'returns-v1', ${invoice.id}, ${invoice.issuedAt}, ${new Date(Date.now() + DAY)}, now(), 0, 0, 0, 'bypass', ${actorId}, 'bypass')`).rejects.toThrow(/paid order/u);
    });

    it('rejects linked refunds above the refund due', async () => {
      const order = await paidOrder({ lines: [{ variant: 0, quantity: 3 }] });
      const created = await service.create(order.orderId, input([restock(order.itemIds[0]!, 1)]), ctx()); // due 1000
      // A plain refund (no link) larger than the return's due, then try to link all of it.
      const plain = await refunds.record({ paymentId: order.paymentId, actorId, requestId: ctx().requestId, idempotencyKey: `plain-${unique()}`, amountMinorUnits: '2000', gatewayReferenceId: `ZP-${unique()}`, reason: 'plain' });
      await expect(prisma.$executeRaw`INSERT INTO "OrderReturnRefund" ("id","returnId","refundId","amount")
        VALUES (${`link-${unique()}`}, ${created.data.id}, ${plain.data.refund.refundId}, 2000)`).rejects.toThrow(/exceed/u);
    });
  });
  // ---------------------------------------------------------------------------
  describe('admin on/off switch', () => {
    const FLAG = 'order-returns';
    const reset = async (enabled: boolean) => prisma.storefrontFeatureFlag.upsert({ where: { key: FLAG }, create: { key: FLAG, enabled, version: 1 }, update: { enabled } });

    it('is OFF by default, blocks new returns and still reports the window', async () => {
      await prisma.storefrontFeatureFlag.deleteMany({ where: { key: FLAG } });
      try {
        expect((await service.readSettings()).data).toEqual({ enabled: false, version: 0, updatedAt: null });
        expect((await service.readPublicConfig()).data).toEqual({ enabled: false });
        const order = await paidOrder();
        const before = await stockOf(variantIds[0]!);
        expect((await service.eligibility(order.orderId)).data).toMatchObject({ eligible: false, reason: 'RETURNS_DISABLED', windowKind: 'IN_PERSON' });
        await expect(service.create(order.orderId, input([restock(order.itemIds[0]!, 1)]), ctx())).rejects.toEqual(reasonOf('RETURNS_DISABLED'));
        expect(await prisma.orderReturn.count({ where: { orderId: order.orderId } })).toBe(0);
        expect(await stockOf(variantIds[0]!)).toBe(before);
      } finally {
        await reset(true);
      }
    });

    it('turns on and off with versioned, audited updates and rejects stale or invalid input', async () => {
      await prisma.storefrontFeatureFlag.deleteMany({ where: { key: FLAG } });
      try {
        const on = await service.updateSettings(actorId, ctx().requestId, { expectedVersion: 0, enabled: true });
        expect(on.data).toMatchObject({ enabled: true, version: 1 });
        expect((await service.readPublicConfig()).data.enabled).toBe(true);
        const order = await paidOrder();
        expect((await service.create(order.orderId, input([restock(order.itemIds[0]!, 1)]), ctx())).data.sequence).toBe(1);

        await expect(service.updateSettings(actorId, ctx().requestId, { expectedVersion: 0, enabled: false })).rejects.toEqual(code('RETURN_SETTINGS_STALE'));
        for (const bad of [{ expectedVersion: -1, enabled: true }, { expectedVersion: 1.5, enabled: true }, { expectedVersion: 1, enabled: 'yes' }]) {
          await expect(service.updateSettings(actorId, ctx().requestId, bad as never)).rejects.toEqual(code('RETURN_INPUT_INVALID'));
        }
        const off = await service.updateSettings(actorId, ctx().requestId, { expectedVersion: 1, enabled: false });
        expect(off.data).toMatchObject({ enabled: false, version: 2 });
        const next = await paidOrder();
        await expect(service.create(next.orderId, input([restock(next.itemIds[0]!, 1)]), ctx())).rejects.toEqual(reasonOf('RETURNS_DISABLED'));
        expect(await prisma.auditLog.count({ where: { action: 'returns.settings.updated', entityId: FLAG, actorId } })).toBe(2);
      } finally {
        await reset(true);
      }
    });

    it('never blocks settling or reading a return that was already recorded', async () => {
      const order = await paidOrder();
      const created = await service.create(order.orderId, input([restock(order.itemIds[0]!, 3)]), ctx());
      await reset(false);
      try {
        expect((await service.get(created.data.id)).data.id).toBe(created.data.id);
        const settled = await service.recordRefund(created.data.id, null, { amountMinorUnits: '3000', gatewayReferenceId: `ZP-${unique()}`, reason: 'Settled while switch is off' }, ctx());
        expect(settled.data).toMatchObject({ paymentStatus: 'REFUNDED', orderReturn: { refundRemaining: { amount: '0' } } });
        const other = await paidOrder();
        await expect(service.create(other.orderId, input([restock(other.itemIds[0]!, 1)]), ctx())).rejects.toEqual(reasonOf('RETURNS_DISABLED'));
      } finally {
        await reset(true);
      }
    });

    it('still replays an already recorded return when retried after the switch is turned off', async () => {
      const order = await paidOrder();
      const context = ctx();
      const body = input([restock(order.itemIds[0]!, 1)]);
      const first = await service.create(order.orderId, body, context);
      await reset(false);
      try {
        expect((await service.create(order.orderId, body, context)).data.id).toBe(first.data.id);
      } finally {
        await reset(true);
      }
    });
  });
});
