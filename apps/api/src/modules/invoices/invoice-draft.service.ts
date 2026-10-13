import { ConflictException, HttpException, Inject, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { Prisma, type InvoicePolicyRevision } from '@prisma/client';
import { createHash } from 'node:crypto';
import type { CheckoutAddress, InvoiceDraft, InvoiceDraftCreate, InvoiceDraftEdit, InvoiceDraftFromOrder } from '@iranyaragh/contracts';
import { PrismaService } from '../../database/prisma.service';
import { normalizeIdempotencyKey } from '../../common/idempotency-key';
import { isPrismaTransactionConflict, withSerializableRetry } from '../../common/serializable-retry';
import { RedactedLogger } from '../../common/redacted-logger';
import { AuditLogService } from '../audit/audit-log.service';
import { StaffOrderService } from '../orders/staff-order.service';
import { ConfiguredShippingQuoteAdapter } from '../orders/configured-shipping-quote.adapter';
import { normalizeCheckoutAddress } from '../orders/checkout-address';
import { STAFF_PICKUP_POLICY } from '../orders/staff-pickup-policy';
import { invoiceDraftEdit, invoiceDraftFields, invoiceDraftId, invoiceDraftText, invoiceDraftVersion } from './invoice-draft.validation';
import { invoiceInvalid } from './invoice-policy.validation';
import { invoiceAmount, quoteInvoice } from './invoice-quote';

const include = { lines: { orderBy: { ordinal: 'asc' as const } }, policyRevision: true };
type Row = Prisma.InvoiceDraftGetPayload<{ include: typeof include }>;
const orderInclude = { items: { orderBy: { ordinal: 'asc' as const } }, customer: true };
type SourceOrder = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
const money = (amount: bigint) => ({ amount: invoiceAmount(amount.toString()).toString(), currency: 'IRR' as const });
const conflict = (code: string, message: string) => new ConflictException({ code, message });
const notFound = () => new NotFoundException({ code: 'INVOICE_DRAFT_NOT_FOUND', message: 'Invoice draft does not exist.' });
const ttl = 15 * 60 * 1000;
const priceRevision = 'catalog-sale-price-v1';

/** Canonical private evidence, also checked by the database deferred draft guard. Never log it. */
export function invoiceDraftStorage(row: Row) {
  return {
    id: row.id, version: row.version, state: row.state, source: row.source, customerId: row.customerId, buyerLabel: row.buyerLabel,
    sourceOrderId: row.sourceOrderId, sourceOrderVersion: row.sourceOrderVersion, sourceOrderHash: row.sourceOrderHash,
    address: row.addressSnapshot, note: row.note, globalDiscount: row.globalDiscount.toString(),
    shippingCode: row.shippingCode, shippingTitle: row.shippingTitle, shippingAmount: row.shippingAmount.toString(),
    shippingPolicyRevision: row.shippingPolicyRevision, pricePolicyRevision: row.pricePolicyRevision,
    quoteExpiresEpoch: row.quoteExpiresAt?.getTime().toString() ?? null, policyRevisionId: row.policyRevisionId,
    lines: row.lines.map(line => ({ variantId: line.variantId, ordinal: line.ordinal, sku: line.sku, title: line.title,
      quantity: line.quantity, unitPrice: line.unitPrice.toString(), discount: line.discount.toString() })),
  };
}
function sourceHash(order: SourceOrder) {
  return hash({ customerId: order.customerId, subtotal: order.subtotal.toString(), discount: order.discount.toString(), shipping: order.shipping.toString(),
    grandTotal: order.grandTotal.toString(), address: order.addressSnapshot, shippingMethod: order.shippingMethod,
    shippingMethodTitle: order.shippingMethodTitle, shippingPolicyRevision: order.shippingPolicyRevision, pricePolicyRevision: order.pricePolicyRevision,
    lines: order.items.map(line => ({ variantId: line.variantId, sku: line.sku, title: line.title, quantity: line.quantity, unitPrice: line.unitPrice.toString(), total: line.total.toString() })) });
}
function buyerLabel(customer: { firstName: string | null; lastName: string | null }) {
  const name = [customer.firstName, customer.lastName].filter(Boolean).join(' ').trim().normalize('NFC');
  return invoiceDraftText(name || 'مشتری', 250)!;
}
function bounds(row: { lines: { quantity: number; unitPrice: bigint; discount: bigint }[]; globalDiscount: bigint; shippingAmount: bigint }) {
  let remaining = 0n;
  for (const line of row.lines) {
    const gross = invoiceAmount((line.unitPrice * BigInt(line.quantity)).toString());
    if (line.discount > gross) throw invoiceInvalid('Line discount exceeds its subtotal.');
    remaining = invoiceAmount((remaining + gross - line.discount).toString());
  }
  if (row.globalDiscount > remaining) throw invoiceInvalid('Global discount exceeds the remaining amount.');
  invoiceAmount((remaining - row.globalDiscount + row.shippingAmount).toString());
}
function validateAmounts(lines: { variantId: string; quantity: number; unitPrice: bigint; discount: bigint }[], globalDiscount: bigint, shippingAmount: bigint, policy: InvoicePolicyRevision | null) {
  bounds({ lines, globalDiscount, shippingAmount });
  if (policy) quoteInvoice(policy, { lines: lines.map(line => ({ id: line.variantId, quantity: line.quantity, unitPrice: line.unitPrice.toString(), discount: line.discount.toString() })), globalDiscount: globalDiscount.toString(), shipping: shippingAmount.toString() });
}
function quotation(row: Row) {
  bounds(row);
  return row.policyRevision ? quoteInvoice(row.policyRevision, { lines: row.lines.map(line => ({ id: line.variantId, quantity: line.quantity,
    unitPrice: line.unitPrice.toString(), discount: line.discount.toString() })), globalDiscount: row.globalDiscount.toString(), shipping: row.shippingAmount.toString() }) : null;
}

@Injectable()
export class InvoiceDraftService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService, @Inject(AuditLogService) private readonly audit: AuditLogService,
    @Inject(StaffOrderService) private readonly catalog: StaffOrderService, @Inject(ConfiguredShippingQuoteAdapter) private readonly shipping: ConfiguredShippingQuoteAdapter) {}

  async list(offset = 0, limit = 25) {
    this.page(offset, limit);
    try {
      return await this.prisma.$transaction(async tx => ({ items: await tx.invoiceDraft.findMany({ skip: offset, take: limit,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { id: true, version: true, state: true, source: true, customerId: true,
          buyerLabel: true, sourceOrderId: true, createdAt: true, updatedAt: true } }), count: await tx.invoiceDraft.count(), offset, limit }),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    } catch (error) { return this.safeFailure(error); }
  }
  async read(id: string): Promise<InvoiceDraft> {
    invoiceDraftId(id);
    try { return await this.prisma.$transaction(async tx => this.view(tx, await this.load(tx, id)), { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }); }
    catch (error) { return this.safeFailure(error); }
  }
  async history(id: string, offset = 0, limit = 25) {
    invoiceDraftId(id); this.page(offset, limit);
    try { return await this.prisma.$transaction(async tx => {
      await this.load(tx, id);
      return { items: await tx.invoiceDraftRevision.findMany({ where: { draftId: id }, skip: offset, take: limit, orderBy: { version: 'desc' },
        select: { version: true, action: true, actorId: true, createdAt: true } }), count: await tx.invoiceDraftRevision.count({ where: { draftId: id } }), offset, limit };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }); } catch (error) { return this.safeFailure(error); }
  }
  async options(kind: 'customer' | 'variant' | 'shipping', search = '', offset = 0, limit = 25) {
    this.page(offset, limit);
    if (typeof search !== 'string' || search.length > 100) throw invoiceInvalid('Bounded search is required.');
    try {
      if (kind !== 'shipping') return await this.catalog.options({ kind, search, offset, limit });
      const methods = await this.prisma.shippingMethod.findMany({ where: { isActive: true, code: { not: STAFF_PICKUP_POLICY.code } }, orderBy: { code: 'asc' }, take: 100 });
      return { data: { items: [{ id: STAFF_PICKUP_POLICY.code, label: STAFF_PICKUP_POLICY.title }, ...methods.map(method => ({ id: method.code, label: method.title }))], count: methods.length + 1 } };
    } catch (error) { return this.safeFailure(error); }
  }

  async create(actorId: string, requestId: string, raw: InvoiceDraftCreate, key: string) {
    const input = { customerId: invoiceDraftId(raw.customerId), ...invoiceDraftFields(raw) };
    return this.command(actorId, requestId, 'create', input, key, async tx => {
      const customer = await tx.customer.findUnique({ where: { id: input.customerId } });
      if (!customer) throw new NotFoundException({ code: 'CUSTOMER_NOT_FOUND', message: 'Customer does not exist.' });
      if (customer.status !== 'ACTIVE') throw conflict('CUSTOMER_INACTIVE', 'An active customer is required.');
      const lines = await this.catalogLines(tx, input.lines);
      const shipping = await this.shipping.quoteForDraft(tx, input.shippingMethodCode, input.address);
      const policy = await this.activePolicy(tx);
      validateAmounts(lines, BigInt(input.globalDiscount), shipping.amount, policy);
      const row = await tx.invoiceDraft.create({ data: { source: 'CATALOG', customerId: customer.id, buyerLabel: buyerLabel(customer),
        addressSnapshot: input.address as unknown as Prisma.InputJsonObject, note: input.note, globalDiscount: BigInt(input.globalDiscount),
        shippingCode: shipping.code, shippingTitle: shipping.title, shippingAmount: shipping.amount, shippingPolicyRevision: shipping.policyRevision,
        pricePolicyRevision: priceRevision, quoteExpiresAt: new Date(Date.now() + ttl), policyRevisionId: policy?.id ?? null,
        lines: { create: lines } }, include });
      quotation(row); return { row, action: 'CREATED' as const, reason: null };
    });
  }
  async fromOrder(actorId: string, requestId: string, orderId: string, raw: InvoiceDraftFromOrder, key: string) {
    invoiceDraftId(orderId);
    const input = { expectedOrderVersion: invoiceDraftVersion(raw.expectedOrderVersion), note: invoiceDraftText(raw.note) };
    return this.command(actorId, requestId, `order:${orderId}`, input, key, async tx => {
      await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR SHARE`;
      const order = await tx.order.findUnique({ where: { id: orderId }, include: orderInclude });
      if (!order) throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: 'Order does not exist.' });
      if (order.version !== input.expectedOrderVersion) throw conflict('STALE_VERSION', 'Review the current source order.');
      if (order.customer.status !== 'ACTIVE' || ['CANCELLED', 'REFUNDED'].includes(order.status)) throw conflict('INVOICE_SOURCE_UNAVAILABLE', 'The source order/customer is not eligible.');
      if (order.items.length < 1 || order.items.length > 50 || new Set(order.items.map(line => line.variantId)).size !== order.items.length ||
        order.items.some(line => line.quantity < 1 || line.quantity > 1000 || line.total !== line.unitPrice * BigInt(line.quantity)) ||
        order.items.reduce((sum, line) => sum + line.total, 0n) !== order.subtotal || order.subtotal - order.discount + order.shipping !== order.grandTotal)
        throw conflict('INVOICE_SOURCE_UNSUPPORTED', 'Source financial terms cannot be represented by this draft contract.');
      const existing = await tx.invoiceDraft.findFirst({ where: { sourceOrderId: orderId, state: 'DRAFT' } });
      if (existing) throw conflict('INVOICE_DRAFT_EXISTS', 'An active draft already exists for this order.');
      const policy = await this.activePolicy(tx);
      const address = normalizeCheckoutAddress(order.addressSnapshot as unknown as CheckoutAddress);
      validateAmounts(order.items.map(line => ({ ...line, discount: 0n })), order.discount, order.shipping, policy);
      const row = await tx.invoiceDraft.create({ data: { source: 'ORDER', customerId: order.customerId, buyerLabel: buyerLabel(order.customer),
        sourceOrderId: orderId, sourceOrderVersion: order.version, sourceOrderHash: sourceHash(order),
        addressSnapshot: address as unknown as Prisma.InputJsonObject, note: input.note, globalDiscount: order.discount,
        shippingCode: order.shippingMethod, shippingTitle: order.shippingMethodTitle, shippingAmount: order.shipping, shippingPolicyRevision: order.shippingPolicyRevision,
        pricePolicyRevision: order.pricePolicyRevision, policyRevisionId: policy?.id ?? null,
        lines: { create: order.items.map((line, ordinal) => ({ variantId: line.variantId, sku: line.sku, title: line.title, ordinal,
          quantity: line.quantity, unitPrice: line.unitPrice, discount: 0n })) } }, include });
      quotation(row); return { row, action: 'CREATED' as const, reason: null };
    });
  }

  async edit(actorId: string, requestId: string, id: string, raw: InvoiceDraftEdit, key: string) {
    invoiceDraftId(id); const input = invoiceDraftEdit(raw);
    return this.command(actorId, requestId, `edit:${id}`, input, key, async tx => {
      const current = await this.editable(tx, id, input.expectedVersion);
      const currentPolicy = await this.activePolicy(tx);
      if ((currentPolicy?.id ?? null) !== current.policyRevisionId) throw conflict('INVOICE_REQUOTE_REQUIRED', 'Review and explicitly refresh the changed invoice policy.');
      let lines;
      let shipping;
      if (current.source === 'CATALOG') {
        if (!current.quoteExpiresAt || current.quoteExpiresAt <= new Date()) throw conflict('INVOICE_REQUOTE_REQUIRED', 'Catalog quotation expired; explicitly refresh prices.');
        lines = await this.catalogLines(tx, input.lines);
        const old = new Map(current.lines.map(line => [line.variantId, line]));
        if (lines.some(line => old.has(line.variantId) && old.get(line.variantId)!.unitPrice !== line.unitPrice)) throw conflict('INVOICE_REQUOTE_REQUIRED', 'Catalog prices changed; explicitly refresh prices.');
        shipping = await this.shipping.quoteForDraft(tx, input.shippingMethodCode, input.address);
        if (shipping.code === current.shippingCode && (shipping.policyRevision !== current.shippingPolicyRevision || shipping.amount !== current.shippingAmount))
          throw conflict('INVOICE_REQUOTE_REQUIRED', 'Shipping tariff changed; explicitly refresh quotation.');
      } else {
        const old = new Map(current.lines.map(line => [line.variantId, line]));
        if (input.lines.some(line => !old.has(line.variantId))) throw conflict('INVOICE_SOURCE_UNSUPPORTED', 'Order drafts retain original SKU prices; create a catalog draft for new SKUs.');
        lines = input.lines.map((line, ordinal) => ({ variantId: line.variantId, sku: old.get(line.variantId)!.sku, title: old.get(line.variantId)!.title,
          unitPrice: old.get(line.variantId)!.unitPrice, quantity: line.quantity, discount: BigInt(line.discount), ordinal }));
        shipping = input.shippingMethodCode === current.shippingCode ? { code: current.shippingCode, title: current.shippingTitle, amount: current.shippingAmount, policyRevision: current.shippingPolicyRevision }
          : await this.shipping.quoteForDraft(tx, input.shippingMethodCode, input.address);
      }
      validateAmounts(lines, BigInt(input.globalDiscount), shipping.amount, current.policyRevision);
      await tx.invoiceDraft.update({ where: { id }, data: { version: { increment: 1 }, addressSnapshot: input.address as unknown as Prisma.InputJsonObject,
        note: input.note, globalDiscount: BigInt(input.globalDiscount), shippingCode: shipping.code, shippingTitle: shipping.title,
        shippingAmount: shipping.amount, shippingPolicyRevision: shipping.policyRevision } });
      await tx.invoiceDraftLine.deleteMany({ where: { draftId: id } });
      await tx.invoiceDraftLine.createMany({ data: lines.map(line => ({ ...line, draftId: id })) });
      const row = await this.load(tx, id); quotation(row);
      return { row, action: 'EDITED' as const, reason: null };
    });
  }
  async requote(actorId: string, requestId: string, id: string, expectedVersion: number, key: string) {
    invoiceDraftId(id); invoiceDraftVersion(expectedVersion);
    return this.command(actorId, requestId, `requote:${id}`, { expectedVersion }, key, async tx => {
      const current = await this.editable(tx, id, expectedVersion);
      const policy = await this.activePolicy(tx);
      let sourceOrderVersion = current.sourceOrderVersion;
      if (current.sourceOrderId) {
        const source = await tx.order.findUnique({ where: { id: current.sourceOrderId }, include: orderInclude });
        if (!source || sourceHash(source) !== current.sourceOrderHash || ['CANCELLED', 'REFUNDED'].includes(source.status))
          throw conflict('INVOICE_SOURCE_CHANGED', 'Source order terms changed; review a new draft from the authoritative order.');
        sourceOrderVersion = source.version;
      }
      const shipping = current.source === 'CATALOG' ? await this.shipping.quoteForDraft(tx, current.shippingCode, current.addressSnapshot as unknown as CheckoutAddress) : null;
      const lines = current.source === 'CATALOG' ? await this.catalogLines(tx, current.lines.map(line => ({ variantId: line.variantId, quantity: line.quantity, discount: line.discount.toString() }))) : null;
      validateAmounts(lines ?? current.lines, current.globalDiscount, shipping?.amount ?? current.shippingAmount, policy);
      await tx.invoiceDraft.update({ where: { id }, data: { version: { increment: 1 }, policyRevisionId: policy?.id ?? null, sourceOrderVersion,
        ...(shipping ? { shippingTitle: shipping.title, shippingAmount: shipping.amount, shippingPolicyRevision: shipping.policyRevision } : {}),
        ...(lines ? { quoteExpiresAt: new Date(Date.now() + ttl), pricePolicyRevision: priceRevision } : {}) } });
      if (lines) { await tx.invoiceDraftLine.deleteMany({ where: { draftId: id } }); await tx.invoiceDraftLine.createMany({ data: lines.map(line => ({ ...line, draftId: id })) }); }
      const row = await this.load(tx, id); quotation(row);
      return { row, action: 'REQUOTED' as const, reason: null };
    });
  }
  async cancel(actorId: string, requestId: string, id: string, expectedVersion: number, rawReason: string, key: string) {
    invoiceDraftId(id); invoiceDraftVersion(expectedVersion); const reason = invoiceDraftText(rawReason);
    if (!reason) throw invoiceInvalid('A cancellation reason is required.');
    return this.command(actorId, requestId, `cancel:${id}`, { expectedVersion, reason }, key, async tx => {
      await this.editable(tx, id, expectedVersion);
      const row = await tx.invoiceDraft.update({ where: { id }, data: { state: 'CANCELLED', version: { increment: 1 } }, include });
      return { row, action: 'CANCELLED' as const, reason };
    });
  }

  private async command(actorId: string, requestId: string, scope: string, input: unknown, key: string,
    apply: (tx: Prisma.TransactionClient) => Promise<{ row: Row; action: 'CREATED' | 'EDITED' | 'REQUOTED' | 'CANCELLED'; reason: string | null }>) {
    if (!actorId || typeof requestId !== 'string' || !requestId.trim() || requestId.length > 100) throw invoiceInvalid('A tracked actor/request is required.');
    const keyHash = hash(normalizeIdempotencyKey(key)); const payloadHash = hash(input);
    try { return await withSerializableRetry({ isContention: isPrismaTransactionConflict, conflictMessage: 'Draft changed concurrently; reconcile before retrying.',
      operation: () => this.prisma.$transaction(async tx => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${scope === 'create' ? `invoice-draft:${actorId}:${keyHash}` : `invoice-draft:${scope.substring(scope.indexOf(':') + 1)}`}, 0))`;
        const prior = await tx.invoiceDraftCommand.findUnique({ where: { actorId_scope_keyHash: { actorId, scope, keyHash } } });
        if (prior) {
          if (prior.payloadHash !== payloadHash) throw conflict('IDEMPOTENCY_CONFLICT', 'Retry key payload changed.');
          return { draft: await this.view(tx, await this.load(tx, prior.draftId)), committedVersion: prior.committedVersion, replayed: true };
        }
        const { row, action, reason } = await apply(tx);
        const draft = await this.view(tx, row);
        await tx.invoiceDraftRevision.create({ data: { draftId: row.id, version: row.version, action, reason, actorId, requestId,
          snapshot: { storage: invoiceDraftStorage(row), document: draft } as unknown as Prisma.InputJsonObject } });
        await tx.invoiceDraftCommand.create({ data: { actorId, scope, keyHash, payloadHash, draftId: row.id, committedVersion: row.version } });
        await this.audit.record({ actorId, requestId, action: `invoice.draft.${action.toLowerCase()}`, entityType: 'invoice_draft', entityId: row.id,
          after: { version: row.version, state: row.state }, metadata: { source: row.source, reasonRecorded: reason !== null } }, tx);
        return { draft, committedVersion: row.version, replayed: false };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }),
    }); } catch (error) { return this.safeFailure(error); }
  }
  private async load(tx: Prisma.TransactionClient, id: string): Promise<Row> { const row = await tx.invoiceDraft.findUnique({ where: { id }, include }); if (!row) throw notFound(); return row; }
  private async editable(tx: Prisma.TransactionClient, id: string, version: number) {
    await tx.$queryRaw`SELECT "id" FROM "InvoiceDraft" WHERE "id" = ${id} FOR UPDATE`;
    const row = await this.load(tx, id);
    if (row.state !== 'DRAFT') throw conflict('INVOICE_DRAFT_TERMINAL', 'Cancelled draft is immutable.');
    if (row.version !== version) throw conflict('STALE_VERSION', 'Review the current draft before editing.');
    return row;
  }
  private async activePolicy(tx: Prisma.TransactionClient): Promise<InvoicePolicyRevision | null> {
    const row = await tx.invoicePolicyRevision.findFirst({ orderBy: { version: 'desc' } }); return row?.isActive ? row : null;
  }
  private async catalogLines(tx: Prisma.TransactionClient, requested: InvoiceDraftCreate['lines']) {
    const lines = await this.catalog.quoteLinesIn(tx, requested);
    return lines.map((line, ordinal) => ({ variantId: line.variantId, sku: line.sku, title: line.variantTitle ?? line.productTitle, ordinal,
      quantity: line.quantity, unitPrice: invoiceAmount(line.unitPrice.toString()), discount: BigInt(requested[ordinal].discount) }));
  }
  private async view(tx: Prisma.TransactionClient, row: Row): Promise<InvoiceDraft> {
    const policy = await this.activePolicy(tx); const quote = quotation(row);
    const source = row.sourceOrderId ? await tx.order.findUnique({ where: { id: row.sourceOrderId }, include: orderInclude }) : null;
    const sourceCurrent = source !== null && source.version === row.sourceOrderVersion && sourceHash(source) === row.sourceOrderHash && !['CANCELLED', 'REFUNDED'].includes(source.status);
    const sourceTermsMatch = row.source === 'ORDER' ? sourceCurrent && quote !== null && quote.total.amount === source!.grandTotal.toString() &&
      row.globalDiscount === source!.discount && row.shippingAmount === source!.shipping && row.shippingCode === source!.shippingMethod &&
      row.lines.length === source!.items.length && row.lines.every((line, index) => {
        const original = source!.items[index]; return line.variantId === original.variantId && line.quantity === original.quantity && line.unitPrice === original.unitPrice && line.discount === 0n;
      }) : null;
    const quotationStatus = !policy || !row.policyRevisionId ? 'POLICY_REQUIRED' : policy.id !== row.policyRevisionId ? 'POLICY_CHANGED' :
      row.source === 'ORDER' && !sourceCurrent ? 'SOURCE_CHANGED' : row.source === 'CATALOG' && (!row.quoteExpiresAt || row.quoteExpiresAt <= new Date()) ? 'PRICE_EXPIRED' : 'CURRENT';
    return { id: row.id, version: row.version, state: row.state, source: row.source, customerId: row.customerId, buyerLabel: row.buyerLabel,
      sourceOrderId: row.sourceOrderId, sourceOrderVersion: row.sourceOrderVersion, sourceTermsMatch,
      address: row.addressSnapshot as unknown as CheckoutAddress, note: row.note,
      lines: row.lines.map(line => ({ variantId: line.variantId, sku: line.sku, title: line.title, quantity: line.quantity,
        unitPrice: money(line.unitPrice), discount: money(line.discount), subtotal: money(line.unitPrice * BigInt(line.quantity)) })),
      globalDiscount: money(row.globalDiscount), shipping: { code: row.shippingCode, title: row.shippingTitle, amount: money(row.shippingAmount), policyRevision: row.shippingPolicyRevision },
      pricePolicyRevision: row.pricePolicyRevision, quoteExpiresAt: row.quoteExpiresAt?.toISOString() ?? null, policyVersion: row.policyRevision?.version ?? null,
      quote, quotationStatus, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
  }
  private page(offset: number, limit: number) { if (!Number.isInteger(offset) || offset < 0 || offset > 1000000 || !Number.isInteger(limit) || limit < 1 || limit > 100) throw invoiceInvalid('Bounded pagination is required.'); }
  private safeFailure(error: unknown): never {
    if (error instanceof HttpException) throw error;
    new RedactedLogger().event('error', { event: 'invoice.draft.failed', outcome: 'unknown', errorCode: 'INVOICE_DRAFT_UNAVAILABLE' });
    throw new InternalServerErrorException({ code: 'INVOICE_DRAFT_UNAVAILABLE', message: 'Draft outcome could not be confirmed. Reconcile before retrying.' });
  }
}
