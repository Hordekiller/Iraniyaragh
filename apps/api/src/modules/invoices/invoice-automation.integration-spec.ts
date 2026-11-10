import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../../database/prisma.service';
import { assertIsolatedTestDatabase } from '../../test/database-url.guard';
import { AuditLogService } from '../audit/audit-log.service';
import type { AuthPermissionService } from '../auth/auth-permission.service';
import { StaffOrderService } from '../orders/staff-order.service';
import { ConfiguredShippingQuoteAdapter } from '../orders/configured-shipping-quote.adapter';
import { EMPTY_AXIS_SIGNATURE, canonicalizeSku } from '../catalog/variant-identifiers';
import { InvoicePolicyService } from './invoice-policy.service';
import { InvoiceDraftService } from './invoice-draft.service';
import { InvoiceDocumentService } from './invoice-document.service';
import { InvoicePublicationService } from './invoice-publication.service';
import { INVOICE_AUTOMATION_FLAG, INVOICE_AUTOMATION_PERMISSIONS, InvoiceAutomationService } from './invoice-automation.service';

describe.sequential('Automatic invoice issuance and publication PostgreSQL acceptance', () => {
  const prisma = new PrismaService(); const audit = new AuditLogService(prisma); const orders = new StaffOrderService(prisma, audit);
  const policies = new InvoicePolicyService(prisma, audit); const shipping = new ConfiguredShippingQuoteAdapter(prisma);
  const drafts = new InvoiceDraftService(prisma, audit, orders, shipping); const documents = new InvoiceDocumentService(prisma, audit, drafts, policies);
  const publications = new InvoicePublicationService(prisma, audit);
  let granted = new Set<string>(INVOICE_AUTOMATION_PERMISSIONS);
  const permissions = { effectivePermissionKeys: async () => granted } as unknown as AuthPermissionService;
  const build = () => new InvoiceAutomationService(prisma, audit, permissions, drafts, documents, publications);
  let service = build();
  const run = randomUUID().replaceAll('-', ''); const requestId = `invoice-auto-${run}`; let sequence = 0;
  let actorId = ''; let customerUserId = ''; let customerId = ''; let variantId = ''; let productId = ''; let warehouseId = ''; let locationId = ''; let connected = false;
  const key = () => `auto-${run}-${sequence++}`;
  const address = { provinceCode: 'THR', city: 'Isolated city', address: 'Isolated invoice address', postalCode: '1234567890', recipient: 'Isolated recipient', mobile: '+989120000000' };
  const stringify = (value: unknown) => JSON.stringify(value, (_key, entry) => typeof entry === 'bigint' ? entry.toString() : entry);

  async function clear() {
    assertIsolatedTestDatabase({ databaseUrl: process.env.DATABASE_URL, nodeEnvironment: process.env.NODE_ENV });
    await prisma.$executeRawUnsafe('TRUNCATE "OrderReturnRefund", "OrderReturnLine", "OrderReturn", "InvoicePdfRenderJobCommand", "InvoicePdfRenderJob", "InvoicePdfArtifact", "InvoicePdfStorageCapacity", "InvoicePublicationCommand", "InvoicePublicationEvent", "InvoicePublication", "InvoiceIssueCommand", "InvoiceDocumentEvent", "InvoiceDocumentLine", "InvoiceDocument", "InvoiceSeriesCounter", "InvoiceDraftCommand", "InvoiceDraftRevision", "InvoiceDraftLine", "InvoiceDraft", "InvoicePolicyCommand", "InvoicePolicyRevision" CASCADE');
    await prisma.storefrontFeatureFlag.deleteMany({ where: { key: INVOICE_AUTOMATION_FLAG } });
    await prisma.auditLog.deleteMany({ where: { entityId: INVOICE_AUTOMATION_FLAG } });
  }
  async function policy(taxTreatment: 'INCLUSIVE' | 'EXCLUSIVE' | 'EXEMPT' = 'EXEMPT') {
    const previous = await policies.current();
    return policies.update(actorId, requestId, { expectedVersion: previous?.version ?? null, sellerName: 'Isolated seller', sellerAddress: 'Isolated seller address', sellerContact: 'Public test contact',
      taxTreatment, taxRateBps: taxTreatment === 'EXCLUSIVE' ? 900 : 0, exemptionReason: taxTreatment === 'EXEMPT' ? 'Isolated exemption' : null, discountCapBps: 10000, shippingTaxable: false, isActive: true, reason: 'Isolated accepted test policy' }, key());
  }
  /** A real staff order; `paid` moves it to PAID the way a verified payment leaves it. */
  async function order(paid = true) {
    const created = (await orders.create({ actorId, requestId: `${requestId}-${sequence++}`, idempotencyKey: key(), payload: { customerId, lines: [{ variantId, quantity: 2 }], address } })).data.order;
    if (paid) await prisma.order.update({ where: { id: created.id }, data: { status: 'PAID', version: { increment: 1 } } });
    return created.id;
  }
  const enable = async (enabled = true) => service.update(actorId, requestId, { expectedVersion: (await service.readAdmin()).version, enabled });
  async function commerceEvidence() {
    const ids = (await prisma.order.findMany({ where: { customerId }, select: { id: true } })).map(row => row.id);
    return stringify({ orders: await prisma.order.findMany({ where: { customerId }, orderBy: { id: 'asc' }, include: { items: true, reservations: true, payments: true } }),
      stock: await prisma.inventoryBalance.findMany({ where: { variantId } }), movements: await prisma.inventoryMovement.count({ where: { variantId } }),
      receivables: await prisma.receivableDocument.count({ where: { account: { customerId } } }), outbox: await prisma.outboxEvent.count({ where: { aggregateId: { in: ids } } }) });
  }

  beforeAll(async () => {
    assertIsolatedTestDatabase({ databaseUrl: process.env.DATABASE_URL, nodeEnvironment: process.env.NODE_ENV });
    await prisma.$connect(); connected = true; await clear();
    actorId = (await prisma.user.create({ data: { email: `${run}@example.test`, status: 'ACTIVE' } })).id;
    customerUserId = (await prisma.user.create({ data: { email: `buyer-${run}@example.test`, status: 'ACTIVE' } })).id;
    customerId = (await prisma.customer.create({ data: { userId: customerUserId, mobile: `+989${(BigInt(`0x${run}`) % 1000000000n).toString().padStart(9, '0')}`, firstName: 'Isolated', lastName: 'Buyer' } })).id;
    productId = (await prisma.product.create({ data: { name: 'Isolated automation product', slug: `invoice-auto-${run}`, status: 'ACTIVE' } })).id;
    const sku = `AUT-${run}`; variantId = (await prisma.productVariant.create({ data: { productId, sku, skuKey: canonicalizeSku(sku), combinationSignature: EMPTY_AXIS_SIGNATURE, salePrice: 1000n, costPrice: 500n, status: 'ACTIVE', isActive: true } })).id;
    warehouseId = (await prisma.warehouse.create({ data: { code: `AUT-${run}`, name: 'Isolated automation warehouse' } })).id;
    locationId = (await prisma.warehouseLocation.create({ data: { warehouseId, code: 'AUTO', name: 'Isolated automation location' } })).id;
    await prisma.inventoryBalance.create({ data: { warehouseId, locationId, variantId, onHand: 500, reserved: 0, available: 500 } });
  });
  beforeEach(async () => {
    await clear(); granted = new Set<string>(INVOICE_AUTOMATION_PERMISSIONS); service = build();
    // Earlier cases leave paid orders behind; cancel nothing, simply make them ineligible for this case.
    await prisma.order.updateMany({ where: { customerId, status: 'PAID' }, data: { status: 'CANCELLED' } }).catch(() => undefined);
  });
  afterAll(async () => {
    if (!connected) return; await clear();
    const ids = (await prisma.order.findMany({ where: { customerId }, select: { id: true } })).map(row => row.id);
    await prisma.stockReservation.deleteMany({ where: { orderId: { in: ids } } }); await prisma.orderTransition.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.staffOrderCommandRecord.deleteMany({ where: { orderId: { in: ids } } }); await prisma.outboxEvent.deleteMany({ where: { aggregateId: { in: ids } } });
    await prisma.orderItem.deleteMany({ where: { orderId: { in: ids } } }); await prisma.order.deleteMany({ where: { id: { in: ids } } });
    await prisma.inventoryBalance.deleteMany({ where: { variantId } }); await prisma.productVariant.delete({ where: { id: variantId } }); await prisma.product.delete({ where: { id: productId } });
    await prisma.warehouseLocation.delete({ where: { id: locationId } }); await prisma.warehouse.delete({ where: { id: warehouseId } }); await prisma.customer.delete({ where: { id: customerId } });
    await prisma.customerCommandRecord.deleteMany({ where: { actorId } }); await prisma.auditLog.deleteMany({ where: { actorId } });
    await prisma.user.deleteMany({ where: { id: { in: [actorId, customerUserId] } } }); await prisma.$disconnect();
  });

  it('is off by default and does nothing until an operator enables it', async () => {
    await policy(); await order();
    expect(await service.readAdmin()).toMatchObject({ enabled: false, version: 0, authorizedById: null, policyReady: true, pendingOrders: 1, unpublishedInvoices: 0 });
    expect(await service.sweep()).toMatchObject({ status: 'disabled', considered: 0 });
    expect(await prisma.invoiceDocument.count()).toBe(0); expect(await prisma.invoiceDraft.count()).toBe(0);
  });

  it('issues and publishes one invoice per paid order, including earlier sales, without touching commerce data', async () => {
    await policy(); const first = await order(); const second = await order(); const unpaid = await order(false);
    const before = await commerceEvidence();
    expect(await enable()).toMatchObject({ enabled: true, version: 1, authorizedById: actorId, pendingOrders: 2 });
    expect(await service.sweep()).toEqual({ status: 'ran', considered: 2, issued: 2, published: 2, failed: 0 });
    const issued = await prisma.invoiceDocument.findMany({ orderBy: { sequence: 'asc' }, include: { publication: true, events: true } });
    expect(issued.map(row => row.orderId)).toEqual([first, second]);
    expect(issued.map(row => row.sequence)).toEqual([1, 2]);
    for (const row of issued) {
      expect(row).toMatchObject({ issuedById: actorId, tax: 0n, grandTotal: 2000n, publication: { version: 1, isPublished: true } });
      expect(row.events).toEqual([expect.objectContaining({ action: 'ISSUED', actorId, requestId: `invoice-automation:${row.orderId}` })]);
    }
    expect(await prisma.invoiceDocument.count({ where: { orderId: unpaid } })).toBe(0);
    expect(await commerceEvidence()).toBe(before);
    // The customer can now read exactly their own published invoices, with no tax amount.
    const mine = await publications.customerList(customerUserId);
    expect(mine.items.map(item => item.orderId).sort()).toEqual([first, second].sort());
    expect((await publications.customerRead(customerUserId, issued[0].id)).quote.tax.amount).toBe('0');
    expect((await publications.customerList(customerUserId, 0, 25, first)).items.map(item => item.orderId)).toEqual([first]);
    expect((await publications.customerList(actorId, 0, 25, first)).items).toEqual([]);
    expect(await service.readAdmin()).toMatchObject({ pendingOrders: 0, unpublishedInvoices: 0 });
  });

  it('converges under repeated and concurrent passes and after a restart', async () => {
    await policy(); const paid = await order(); await enable();
    const passes = await Promise.all([service.sweep(), build().sweep(), build().sweep()]);
    expect(passes.every(pass => pass.status === 'ran')).toBe(true);
    await build().sweep(); await build().sweep();
    expect(await prisma.invoiceDocument.count({ where: { orderId: paid } })).toBe(1);
    expect(await prisma.invoiceDraft.count({ where: { sourceOrderId: paid } })).toBe(1);
    expect(await prisma.invoiceSeriesCounter.findFirstOrThrow()).toMatchObject({ lastNumber: 1 });
    expect(await prisma.invoicePublicationEvent.count()).toBe(1);
    expect(await build().sweep()).toMatchObject({ considered: 0, issued: 0, published: 0, failed: 0 });
  });

  it('finishes publication when an earlier pass stopped after issuing', async () => {
    await policy(); const paid = await order(); await enable();
    const version = (await prisma.order.findUniqueOrThrow({ where: { id: paid } })).version; const auto = `invoice-automation:${paid}`;
    const draft = (await drafts.fromOrder(actorId, auto, paid, { expectedOrderVersion: version, note: null }, `automation-draft-${paid}-v${version}`)).draft;
    await documents.issue(actorId, auto, draft.id, { expectedVersion: draft.version, expectedOrderVersion: version }, `automation-issue-${paid}`);
    expect(await service.readAdmin()).toMatchObject({ pendingOrders: 0, unpublishedInvoices: 1 });
    expect(await service.sweep()).toEqual({ status: 'ran', considered: 1, issued: 0, published: 1, failed: 0 });
    expect(await prisma.invoicePublication.findFirstOrThrow()).toMatchObject({ isPublished: true, version: 1 });
  });

  it('never overrides staff: an open staff draft is left alone and a staff-issued private invoice stays private', async () => {
    await policy(); const drafted = await order(); const issuedByStaff = await order(); await enable();
    const version = (await prisma.order.findUniqueOrThrow({ where: { id: drafted } })).version;
    await drafts.fromOrder(actorId, requestId, drafted, { expectedOrderVersion: version, note: null }, key());
    const other = (await prisma.order.findUniqueOrThrow({ where: { id: issuedByStaff } })).version;
    const draft = (await drafts.fromOrder(actorId, requestId, issuedByStaff, { expectedOrderVersion: other, note: null }, key())).draft;
    await documents.issue(actorId, requestId, draft.id, { expectedVersion: draft.version, expectedOrderVersion: other }, key());
    expect(await service.sweep()).toEqual({ status: 'ran', considered: 1, issued: 0, published: 0, failed: 1 });
    expect(await prisma.invoiceDocument.count({ where: { orderId: drafted } })).toBe(0);
    expect(await prisma.invoicePublication.count()).toBe(0);
    // A revoked automatic invoice is a staff decision too and is not published again.
    const fresh = await order(); await service.sweep();
    const document = await prisma.invoiceDocument.findUniqueOrThrow({ where: { orderId: fresh } });
    await publications.change(actorId, requestId, document.id, { expectedVersion: 1, isPublished: false, reason: 'Isolated staff revocation' }, key());
    await build().sweep();
    expect(await prisma.invoicePublication.findUniqueOrThrow({ where: { documentId: document.id } })).toMatchObject({ isPublished: false, version: 2 });
  });

  it('fails closed: no policy, a tax-adding policy, a lost permission or a switched-off setting issue nothing', async () => {
    const paid = await order(); await enable();
    expect(await service.readAdmin()).toMatchObject({ policyReady: false });
    expect(await service.sweep()).toMatchObject({ status: 'policy-required', considered: 0 });
    expect(await prisma.invoiceDraft.count()).toBe(0);
    await policy('EXCLUSIVE');
    expect(await build().sweep()).toMatchObject({ status: 'ran', issued: 0, failed: 1 });
    expect(await prisma.invoiceDocument.count()).toBe(0); expect(await prisma.invoiceSeriesCounter.count()).toBe(0);
    await policy('EXEMPT'); granted = new Set(['invoices.read']);
    expect(await build().sweep()).toMatchObject({ status: 'unauthorized', considered: 0 });
    granted = new Set<string>(INVOICE_AUTOMATION_PERMISSIONS); await prisma.user.update({ where: { id: actorId }, data: { status: 'SUSPENDED' } });
    expect(await build().sweep()).toMatchObject({ status: 'unauthorized', considered: 0 });
    await prisma.user.update({ where: { id: actorId }, data: { status: 'ACTIVE' } }); await enable(false);
    expect(await build().sweep()).toMatchObject({ status: 'disabled' });
    expect(await prisma.invoiceDocument.count({ where: { orderId: paid } })).toBe(0);
    await enable(true);
    // The draft opened under the rejected policy is requoted under the current one, not abandoned.
    expect(await build().sweep()).toMatchObject({ status: 'ran', issued: 1, published: 1, failed: 0 });
    expect(await prisma.invoiceDraft.count({ where: { sourceOrderId: paid } })).toBe(1);
    expect(await prisma.invoiceDocument.findUniqueOrThrow({ where: { orderId: paid } })).toMatchObject({ tax: 0n, grandTotal: 2000n });
  });

  it('backs off an order that cannot be invoiced so later orders are still served, and rejects a stale setting write', async () => {
    await enable(); const blocked = await order(); await policy();
    const version = (await prisma.order.findUniqueOrThrow({ where: { id: blocked } })).version;
    await drafts.fromOrder(actorId, requestId, blocked, { expectedOrderVersion: version, note: null }, key());
    const now = new Date();
    expect(await service.sweep(1, now)).toMatchObject({ considered: 1, failed: 1 });
    const next = await order();
    expect(await service.sweep(1, now)).toMatchObject({ considered: 1, issued: 1, published: 1, failed: 0 });
    expect(await prisma.invoiceDocument.count({ where: { orderId: next } })).toBe(1);
    await expect(service.update(actorId, requestId, { expectedVersion: 0, enabled: false })).rejects.toMatchObject({ response: { code: 'STALE_VERSION' } });
    await expect(service.update(actorId, requestId, { expectedVersion: -1, enabled: true })).rejects.toMatchObject({ response: { code: 'INVALID_REQUEST' } });
  });
});
