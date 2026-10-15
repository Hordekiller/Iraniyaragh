import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { InvoiceDraftCreate } from '@iranyaragh/contracts';
import { PrismaService } from '../../database/prisma.service';
import { assertIsolatedTestDatabase } from '../../test/database-url.guard';
import { AuditLogService } from '../audit/audit-log.service';
import { RedactedLogger } from '../../common/redacted-logger';
import { StaffOrderService } from '../orders/staff-order.service';
import { ConfiguredShippingQuoteAdapter } from '../orders/configured-shipping-quote.adapter';
import { EMPTY_AXIS_SIGNATURE, canonicalizeSku } from '../catalog/variant-identifiers';
import { InvoicePolicyService } from './invoice-policy.service';
import { InvoiceDraftService } from './invoice-draft.service';

describe.sequential('Independent invoice draft PostgreSQL financial/security acceptance', () => {
  const prisma = new PrismaService(); const audit = new AuditLogService(prisma); const catalog = new StaffOrderService(prisma, audit);
  const shipping = new ConfiguredShippingQuoteAdapter(prisma); const policies = new InvoicePolicyService(prisma, audit);
  const service = new InvoiceDraftService(prisma, audit, catalog, shipping); const run = randomUUID().replaceAll('-', '');
  let actorId = ''; let customerId = ''; let variantId = ''; let productId = ''; let warehouseId = ''; let locationId = ''; let connected = false; let seq = 0;
  const key = () => `draft-${run}-${seq++}`;
  const requestId = `draft-it-${run}`;
  const address = { provinceCode: 'THR', city: 'Isolated city', address: 'Isolated address', postalCode: '1234567890', recipient: 'Isolated buyer', mobile: '+989120000000' };
  const input = (): InvoiceDraftCreate => ({ customerId, address, lines: [{ variantId, quantity: 2, discount: '0' }], globalDiscount: '0', shippingMethodCode: 'PICKUP', note: null });
  const code = (value: string) => expect.objectContaining({ response: expect.objectContaining({ code: value }) });
  const create = (body = input(), commandKey = key()) => service.create(actorId, requestId, body, commandKey);
  const editInput = (draft: Awaited<ReturnType<typeof create>>['draft']) => ({ address: draft.address, lines: draft.lines.map(line => ({ variantId: line.variantId, quantity: line.quantity, discount: line.discount.amount })),
    globalDiscount: draft.globalDiscount.amount, shippingMethodCode: draft.shipping.code, note: draft.note, expectedVersion: draft.version });
  async function clear() {
    assertIsolatedTestDatabase({ databaseUrl: process.env.DATABASE_URL, nodeEnvironment: process.env.NODE_ENV });
    await prisma.$executeRawUnsafe('TRUNCATE "InvoicePublicationCommand", "InvoicePublicationEvent", "InvoicePublication", "InvoiceIssueCommand", "InvoiceDocumentEvent", "InvoiceDocumentLine", "InvoiceDocument", "InvoiceSeriesCounter", "InvoiceDraftCommand", "InvoiceDraftRevision", "InvoiceDraftLine", "InvoiceDraft", "InvoicePolicyCommand", "InvoicePolicyRevision"');
  }
  async function evidence() { return { orders: await prisma.order.findMany({ where: { customerId }, include: { items: true, reservations: true, payments: true } }),
    stock: await prisma.inventoryBalance.findMany({ where: { variantId } }), movements: await prisma.inventoryMovement.count({ where: { variantId } }),
    credit: await prisma.receivableDocument.count({ where: { account: { customerId } } }), outbox: await prisma.outboxEvent.count() }; }
  const safe = (value: unknown) => JSON.stringify(value, (_key, entry) => typeof entry === 'bigint' ? entry.toString() : entry);
  beforeAll(async () => {
    assertIsolatedTestDatabase({ databaseUrl: process.env.DATABASE_URL, nodeEnvironment: process.env.NODE_ENV });
    await prisma.$connect(); connected = true; await clear();
    actorId = (await prisma.user.create({ data: { email: `${run}@example.test`, status: 'ACTIVE' } })).id;
    const suffix = (BigInt(`0x${run}`) % 1000000000n).toString().padStart(9, '0');
    customerId = (await prisma.customer.create({ data: { mobile: `+989${suffix}`, firstName: 'Isolated', lastName: 'Buyer' } })).id;
    productId = (await prisma.product.create({ data: { name: 'Isolated invoice SKU', slug: `invoice-draft-${run}`, status: 'ACTIVE' } })).id;
    const sku = `INV-${run}`;
    variantId = (await prisma.productVariant.create({ data: { productId, sku, skuKey: canonicalizeSku(sku), combinationSignature: EMPTY_AXIS_SIGNATURE, salePrice: 1000n, costPrice: 500n, status: 'ACTIVE', isActive: true } })).id;
    warehouseId = (await prisma.warehouse.create({ data: { code: `INV-${run}`, name: 'Isolated warehouse' } })).id;
    locationId = (await prisma.warehouseLocation.create({ data: { warehouseId, code: 'INV-IT', name: 'Isolated shelf' } })).id;
    await prisma.inventoryBalance.create({ data: { variantId, warehouseId, locationId, onHand: 100, reserved: 0, available: 100 } });
  });
  afterAll(async () => {
    if (!connected) return; await clear();
    const orders = (await prisma.order.findMany({ where: { customerId }, select: { id: true } })).map(order => order.id);
    await prisma.stockReservation.deleteMany({ where: { orderId: { in: orders } } }); await prisma.orderTransition.deleteMany({ where: { orderId: { in: orders } } });
    await prisma.staffOrderCommandRecord.deleteMany({ where: { orderId: { in: orders } } }); await prisma.outboxEvent.deleteMany({ where: { aggregateId: { in: orders } } });
    await prisma.orderItem.deleteMany({ where: { orderId: { in: orders } } }); await prisma.order.deleteMany({ where: { id: { in: orders } } });
    await prisma.inventoryBalance.deleteMany({ where: { variantId } }); await prisma.productVariant.delete({ where: { id: variantId } }); await prisma.product.delete({ where: { id: productId } });
    await prisma.warehouseLocation.delete({ where: { id: locationId } }); await prisma.warehouse.delete({ where: { id: warehouseId } });
    await prisma.shippingMethod.deleteMany({ where: { code: `INV-${run}` } }); await prisma.customer.delete({ where: { id: customerId } });
    await prisma.auditLog.deleteMany({ where: { actorId } }); await prisma.user.delete({ where: { id: actorId } }); await prisma.$disconnect();
  });
  it('creates a real catalog quotation without invented tax or any financial/stock effects when policy is missing', async () => {
    const before = await evidence(); const result = await create();
    expect(result.draft).toMatchObject({ state: 'DRAFT', version: 0, policyVersion: null, quote: null, quotationStatus: 'POLICY_REQUIRED', customerId });
    expect(result.draft.lines[0].unitPrice.amount).toBe('1000'); expect(safe(await evidence())).toBe(safe(before));
    await expect(create({ ...input(), lines: [{ variantId, quantity: 2, discount: '2001' }] })).rejects.toMatchObject(code('VALIDATION_ERROR'));
    expect(await prisma.invoiceDraft.count()).toBe(1);
  });
  it('requires an approved policy to calculate tax and exact total; stores no address/note in audit', async () => {
    await policies.update(actorId, requestId, { sellerName: 'Isolated seller', sellerAddress: 'Isolated seller address', sellerContact: 'example.test',
      taxTreatment: 'EXCLUSIVE', taxRateBps: 1000, exemptionReason: null, discountCapBps: 2500, shippingTaxable: false, isActive: true, expectedVersion: null, reason: 'Isolated approved policy' }, key());
    const result = await create({ ...input(), note: 'Private invoice note', globalDiscount: '100' });
    expect(result.draft.quote).toMatchObject({ subtotal: { amount: '2000' }, discount: { amount: '100' }, tax: { amount: '190' }, total: { amount: '2090' } });
    expect((await service.read(result.draft.id)).quote).toEqual(result.draft.quote);
    const audits = await prisma.auditLog.findMany({ where: { actorId, action: { startsWith: 'invoice.draft' } } });
    const output = JSON.stringify(audits); for (const text of [address.mobile, address.address, address.recipient, 'Private invoice note']) expect(output).not.toContain(text);
    expect(await service.history(result.draft.id)).toMatchObject({ count: 1, items: [{ version: 0, action: 'CREATED', actorId }] });
    expect(JSON.stringify(await service.history(result.draft.id))).not.toContain(address.mobile);
  });
  it('serializes repeated creates and replays the current draft with original committed version after edit/restart', async () => {
    const commandKey = key(); const results = await Promise.all([create(input(), commandKey), create(input(), commandKey), create(input(), commandKey)]);
    expect(new Set(results.map(result => result.draft.id)).size).toBe(1);
    const original = results[0].draft; const edited = await service.edit(actorId, requestId, original.id, { ...editInput(original), note: 'Edited draft' }, key());
    const restarted = new InvoiceDraftService(prisma, audit, catalog, shipping);
    const replay = await restarted.create(actorId, requestId, input(), commandKey);
    expect(replay).toMatchObject({ committedVersion: 0, replayed: true, draft: { version: 1, note: 'Edited draft' } });
    expect(replay.draft).toEqual(edited.draft); expect(await prisma.invoiceDraftCommand.count({ where: { draftId: original.id } })).toBe(2);
    await expect(create({ ...input(), note: 'Changed replay' }, commandKey)).rejects.toMatchObject(code('IDEMPOTENCY_CONFLICT'));
  });
  it('allows only one concurrent edit from the same version, preserving history', async () => {
    const draft = (await create()).draft;
    const results = await Promise.allSettled(['first', 'second'].map(note => service.edit(actorId, requestId, draft.id, { ...editInput(draft), note }, key())));
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find(result => result.status === 'rejected')).toMatchObject({ reason: { response: { code: 'STALE_VERSION' } } });
    expect((await service.history(draft.id)).items.map(item => item.version)).toEqual([1, 0]);
  });
  it('requires explicit price refresh instead of silently accepting a changed catalog price', async () => {
    const draft = (await create()).draft; await prisma.productVariant.update({ where: { id: variantId }, data: { salePrice: 1500n } });
    await expect(service.edit(actorId, requestId, draft.id, editInput(draft), key())).rejects.toMatchObject(code('INVOICE_REQUOTE_REQUIRED'));
    const refreshed = await service.requote(actorId, requestId, draft.id, draft.version, key());
    expect(refreshed.draft.lines[0].unitPrice.amount).toBe('1500'); expect(refreshed.draft.quote!.total.amount).toBe('3300');
    await prisma.productVariant.update({ where: { id: variantId }, data: { salePrice: 1000n } });
  });
  it('uses approved configured shipping tariffs without creating a fake cart or checkout quote', async () => {
    await prisma.shippingMethod.create({ data: { code: `INV-${run}`, title: 'Approved isolated carrier', amount: 500n, policyRevision: 'approved-it-v1' } });
    const options = await service.options('shipping');
    expect(options.data.items).toContainEqual({ id: 'PICKUP', label: 'تحویل حضوری', detail: null });
    expect(options.data.items).toContainEqual({ id: `INV-${run}`, label: 'Approved isolated carrier', detail: null });
    const carts = await prisma.cart.count(); const quotes = await prisma.shippingQuote.count();
    const draft = (await create({ ...input(), shippingMethodCode: `INV-${run}` })).draft;
    expect(draft.shipping.amount.amount).toBe('500'); expect(draft.quote!.total.amount).toBe('2700');
    expect(await prisma.cart.count()).toBe(carts); expect(await prisma.shippingQuote.count()).toBe(quotes);
    await prisma.shippingMethod.update({ where: { code: `INV-${run}` }, data: { amount: 700n, policyRevision: 'approved-it-v2' } });
    await expect(service.edit(actorId, requestId, draft.id, editInput(draft), key())).rejects.toMatchObject(code('INVOICE_REQUOTE_REQUIRED'));
    expect((await service.requote(actorId, requestId, draft.id, draft.version, key())).draft.shipping.amount.amount).toBe('700');
    await expect(create({ ...input(), shippingMethodCode: 'NOT-APPROVED' })).rejects.toMatchObject(code('SHIPPING_UNAVAILABLE'));
  });
  it('copies original order prices and permits quotation edits without changing source order/payment/stock/receivables/outbox', async () => {
    const order = (await catalog.create({ actorId, requestId, idempotencyKey: key(), payload: { customerId, address, lines: [{ variantId, quantity: 2 }], note: 'Private staff note' } })).data.order;
    const before = await evidence();
    await prisma.productVariant.update({ where: { id: variantId }, data: { salePrice: 9000n } });
    const result = await service.fromOrder(actorId, requestId, order.id, { expectedOrderVersion: order.version, note: null }, key());
    expect(result.draft.lines[0].unitPrice.amount).toBe('1000'); expect(result.draft.sourceTermsMatch).toBe(false); // Approved exclusive tax cannot rewrite old order total.
    expect(JSON.stringify(result)).not.toContain('Private staff note');
    const changed = await service.edit(actorId, requestId, result.draft.id, { ...editInput(result.draft), lines: [{ variantId, quantity: 1, discount: '50' }], address: { ...address, city: 'Billing city' } }, key());
    expect(changed.draft.lines[0].unitPrice.amount).toBe('1000'); expect(changed.draft.sourceTermsMatch).toBe(false);
    expect(safe(await evidence())).toBe(safe(before));
    await expect(service.fromOrder(actorId, requestId, order.id, { expectedOrderVersion: order.version, note: null }, key())).rejects.toMatchObject(code('INVOICE_DRAFT_EXISTS'));
    await prisma.productVariant.update({ where: { id: variantId }, data: { salePrice: 1000n } });
  });
  it('requires explicit policy refresh and preserves the previous financial snapshot', async () => {
    const draft = (await create()).draft; const original = draft.quote;
    const policy = (await policies.current())!;
    await policies.update(actorId, requestId, { ...policy, taxRateBps: 2000, expectedVersion: policy.version, reason: 'Approved revised policy' }, key());
    expect(await service.read(draft.id)).toMatchObject({ quotationStatus: 'POLICY_CHANGED', quote: original });
    await expect(service.edit(actorId, requestId, draft.id, editInput(draft), key())).rejects.toMatchObject(code('INVOICE_REQUOTE_REQUIRED'));
    const refreshed = await service.requote(actorId, requestId, draft.id, draft.version, key());
    expect(refreshed.draft.quote!.total.amount).toBe('2400');
    const first = await prisma.invoiceDraftRevision.findUniqueOrThrow({ where: { draftId_version: { draftId: draft.id, version: 0 } } });
    expect(first.snapshot).toMatchObject({ document: { quote: original } });
  });
  it('expires stored catalog prices without hiding the snapshot and permits only explicit refresh', async () => {
    const draft = (await create()).draft;
    try {
      vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(Date.now() + 16 * 60 * 1000));
      expect((await service.read(draft.id)).quotationStatus).toBe('PRICE_EXPIRED');
      await expect(service.edit(actorId, requestId, draft.id, editInput(draft), key())).rejects.toMatchObject(code('INVOICE_REQUOTE_REQUIRED'));
      const refreshed = await service.requote(actorId, requestId, draft.id, draft.version, key());
      expect(refreshed.draft.quotationStatus).toBe('CURRENT'); expect(refreshed.draft.version).toBe(1);
    } finally { vi.useRealTimers(); }
  });
  it('rejects signed-BIGINT overflow and inactive/missing real catalog references before persistence', async () => {
    const count = await prisma.invoiceDraft.count();
    await prisma.productVariant.update({ where: { id: variantId }, data: { salePrice: 9223372036854775807n } });
    try { await expect(create()).rejects.toMatchObject(code('VALIDATION_ERROR')); }
    finally { await prisma.productVariant.update({ where: { id: variantId }, data: { salePrice: 1000n } }); }
    await prisma.productVariant.update({ where: { id: variantId }, data: { isActive: false } });
    try { await expect(create()).rejects.toMatchObject(code('SKU_NOT_SELLABLE')); }
    finally { await prisma.productVariant.update({ where: { id: variantId }, data: { isActive: true } }); }
    await expect(create({ ...input(), lines: [{ variantId: 'not-a-real-sku', quantity: 1, discount: '0' }] })).rejects.toMatchObject(code('SKU_NOT_FOUND'));
    expect(await prisma.invoiceDraft.count()).toBe(count);
  });
  it('preserves sealed lines, identity, history and commands against direct SQL mutation', async () => {
    const draft = (await create()).draft; const line = await prisma.invoiceDraftLine.findFirstOrThrow({ where: { draftId: draft.id } });
    await expect(prisma.invoiceDraftLine.update({ where: { id: line.id }, data: { unitPrice: 1n } })).rejects.toThrow();
    await expect(prisma.invoiceDraftLine.delete({ where: { id: line.id } })).rejects.toThrow();
    await expect(prisma.invoiceDraft.update({ where: { id: draft.id }, data: { note: 'No version' } })).rejects.toThrow();
    await expect(prisma.invoiceDraft.update({ where: { id: draft.id }, data: { version: { increment: 1 }, note: 'No evidence' } })).rejects.toThrow();
    const revision = await prisma.invoiceDraftRevision.findUniqueOrThrow({ where: { draftId_version: { draftId: draft.id, version: 0 } } });
    await expect(prisma.invoiceDraftRevision.update({ where: { id: revision.id }, data: { snapshot: {} } })).rejects.toThrow();
    const command = await prisma.invoiceDraftCommand.findFirstOrThrow({ where: { draftId: draft.id } });
    await expect(prisma.invoiceDraftCommand.delete({ where: { id: command.id } })).rejects.toThrow();
    expect((await service.read(draft.id)).version).toBe(0);
  });
  it('cancels only the independent workspace and prevents further mutation with idempotent replay', async () => {
    const draft = (await create()).draft; const before = await evidence(); const commandKey = key();
    const result = await service.cancel(actorId, requestId, draft.id, draft.version, 'No longer needed', commandKey);
    expect(result.draft).toMatchObject({ state: 'CANCELLED', version: 1 });
    expect((await service.cancel(actorId, requestId, draft.id, draft.version, 'No longer needed', commandKey)).replayed).toBe(true);
    await expect(service.edit(actorId, requestId, draft.id, editInput(result.draft), key())).rejects.toMatchObject(code('INVOICE_DRAFT_TERMINAL'));
    expect(safe(await evidence())).toBe(safe(before));
  });
  it('rolls back draft/lines/history/command on audit failure, redacting private input in unknown outcome', async () => {
    const count = await prisma.invoiceDraft.count(); const event = vi.spyOn(RedactedLogger.prototype, 'event').mockImplementation(() => undefined);
    const failing = new InvoiceDraftService(prisma, { record: async () => { throw new Error(address.address); } } as unknown as AuditLogService, catalog, shipping);
    await expect(failing.create(actorId, requestId, input(), key())).rejects.toMatchObject(code('INVOICE_DRAFT_UNAVAILABLE'));
    expect(await prisma.invoiceDraft.count()).toBe(count); expect(JSON.stringify(event.mock.calls)).not.toContain(address.address); event.mockRestore();
  });
});
