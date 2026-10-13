import { ConflictException, HttpException, Inject, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import type { InvoiceDocument, InvoiceDocumentSummary, InvoiceIssueRequest } from '@iranyaragh/contracts';
import { PrismaService } from '../../database/prisma.service';
import { AuditLogService } from '../audit/audit-log.service';
import { normalizeIdempotencyKey } from '../../common/idempotency-key';
import { withSerializableRetry, isPrismaTransactionConflict } from '../../common/serializable-retry';
import { RedactedLogger } from '../../common/redacted-logger';
import { InvoiceDraftService, invoiceDraftStorage } from './invoice-draft.service';
import { InvoicePolicyService } from './invoice-policy.service';
import { invoiceDraftId, invoiceDraftVersion } from './invoice-draft.validation';
import { invoiceInvalid } from './invoice-policy.validation';

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
const conflict = (message: string) => new ConflictException({ code: 'INVOICE_ISSUE_CONFLICT', message });
const missing = () => new NotFoundException({ code: 'INVOICE_DOCUMENT_NOT_FOUND', message: 'Invoice document does not exist.' });
const money = (amount: bigint) => ({ amount: amount.toString(), currency: 'IRR' as const });
const draftInclude = { lines: { orderBy: { ordinal: 'asc' as const } }, policyRevision: true };
type DocumentRow = Prisma.InvoiceDocumentGetPayload<Record<string, never>>;
function view(row: DocumentRow): InvoiceDocument { return row.snapshot as unknown as InvoiceDocument; }
export function storeInvoicePeriod(now: Date) {
  return Number(new Intl.DateTimeFormat('en-US', { year: 'numeric', calendar: 'gregory', timeZone: 'Asia/Tehran' }).format(now));
}

@Injectable()
export class InvoiceDocumentService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService, @Inject(AuditLogService) private readonly audit: AuditLogService,
    @Inject(InvoiceDraftService) private readonly drafts: InvoiceDraftService, @Inject(InvoicePolicyService) private readonly policies: InvoicePolicyService) {}

  async read(id: string): Promise<InvoiceDocument> {
    invoiceDraftId(id);
    try { const row = await this.prisma.invoiceDocument.findUnique({ where: { id } }); if (!row) throw missing(); return view(row); }
    catch (error) { return this.safeFailure(error); }
  }
  async fromDraft(draftId: string): Promise<InvoiceDocument> {
    invoiceDraftId(draftId);
    try { const row = await this.prisma.invoiceDocument.findUnique({ where: { draftId } }); if (!row) throw missing(); return view(row); }
    catch (error) { return this.safeFailure(error); }
  }
  async list(offset = 0, limit = 25): Promise<{ items: InvoiceDocumentSummary[]; count: number; offset: number; limit: number }> {
    if (!Number.isInteger(offset) || offset < 0 || offset > 1000000 || !Number.isInteger(limit) || limit < 1 || limit > 100) throw invoiceInvalid('Bounded pagination is required.');
    try { return await this.prisma.$transaction(async tx => {
      const rows = await tx.invoiceDocument.findMany({ skip: offset, take: limit, orderBy: [{ issuedAt: 'desc' }, { id: 'desc' }],
        select: { id: true, number: true, orderId: true, customerId: true, issuedAt: true, grandTotal: true, snapshot: true } });
      return { items: rows.map(row => ({ id: row.id, number: row.number, orderId: row.orderId, customerId: row.customerId, issuedAt: row.issuedAt.toISOString(),
        buyerLabel: (row.snapshot as unknown as InvoiceDocument).buyerLabel, total: money(row.grandTotal) })), count: await tx.invoiceDocument.count(), offset, limit };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }); } catch (error) { return this.safeFailure(error); }
  }
  async issue(actorId: string, requestId: string, draftId: string, raw: InvoiceIssueRequest, key: string) {
    invoiceDraftId(draftId);
    const input = { expectedVersion: invoiceDraftVersion(raw.expectedVersion), expectedOrderVersion: invoiceDraftVersion(raw.expectedOrderVersion) };
    if (!actorId || typeof requestId !== 'string' || !requestId.trim() || requestId.length > 100) throw invoiceInvalid('A tracked actor/request is required.');
    const keyHash = hash(normalizeIdempotencyKey(key)); const payloadHash = hash(input);
    try { return await withSerializableRetry({ isContention: isPrismaTransactionConflict, conflictMessage: 'Invoice issuance changed concurrently; reconcile with the same request.',
      operation: () => this.prisma.$transaction(async tx => {
        // Use the same policy lock as revision writers; approval cannot change mid-issue.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(1936608609, 1768842863)`;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`invoice-draft:${draftId}`}, 0))`;
        const prior = await tx.invoiceIssueCommand.findUnique({ where: { actorId_draftId_keyHash: { actorId, draftId, keyHash } }, include: { document: true } });
        if (prior) {
          if (prior.payloadHash !== payloadHash) throw new ConflictException({ code: 'IDEMPOTENCY_CONFLICT', message: 'Issuance retry payload changed.' });
          return { document: view(prior.document), committedVersion: prior.committedVersion, replayed: true };
        }
        const row = await tx.invoiceDraft.findUnique({ where: { id: draftId }, include: draftInclude });
        if (!row) throw new NotFoundException({ code: 'INVOICE_DRAFT_NOT_FOUND', message: 'Invoice draft does not exist.' });
        if (row.state !== 'DRAFT') throw conflict('Only an editable draft can issue; reconcile its existing document.');
        if (row.version !== input.expectedVersion) throw new ConflictException({ code: 'STALE_VERSION', message: 'Review the current draft version.' });
        if (row.source !== 'ORDER' || !row.sourceOrderId) throw conflict('Catalog quotations require an authorized source order before issuance.');
        await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${row.sourceOrderId} FOR UPDATE`;
        const order = await tx.order.findUnique({ where: { id: row.sourceOrderId }, include: { items: { orderBy: { ordinal: 'asc' } }, customer: true } });
        if (!order || order.customerId !== row.customerId || order.customer.status !== 'ACTIVE' || !['PENDING_PAYMENT','PAID','CREDIT_APPROVED'].includes(order.status)) throw conflict('The source sale/customer is not currently eligible.');
        if (order.version !== input.expectedOrderVersion || row.sourceOrderVersion !== order.version) throw new ConflictException({ code: 'INVOICE_SOURCE_CHANGED', message: 'Review and requote the current source order.' });
        const policy = await this.policies.requireActive(tx);
        if (policy.id !== row.policyRevisionId) throw new ConflictException({ code: 'INVOICE_REQUOTE_REQUIRED', message: 'Explicitly review the current seller/tax policy.' });
        const draft = await this.drafts.inspectIn(tx, draftId);
        if (draft.quotationStatus !== 'CURRENT' || !draft.sourceTermsMatch || !draft.quote || draft.quote.total.amount !== order.grandTotal.toString()) throw conflict('Issued terms must match the original authorized sale and current backend quote exactly.');
        if (await tx.invoiceDocument.findUnique({ where: { orderId: order.id }, select: { id: true } })) throw conflict('An original invoice already exists for this order.');
        const now = new Date(); const period = storeInvoicePeriod(now);
        if (period < 2000 || period > 9999) throw conflict('Issuance time is outside the supported store numbering period.');
        const counter = await tx.invoiceSeriesCounter.upsert({ where: { series_period: { series: 'SALE', period } },
          create: { series: 'SALE', period, lastNumber: 1 }, update: { lastNumber: { increment: 1 } } });
        if (counter.lastNumber > 999999999) throw conflict('Store numbering period capacity reached.');
        const number = `IRY-${period}-${String(counter.lastNumber).padStart(6, '0')}`;
        const id = `inv_${createHash('sha256').update(`${actorId}:${draftId}:${keyHash}`).digest('hex').slice(0,40)}`;
        const document: InvoiceDocument = { id, draftId, draftVersion: row.version + 1, orderId: order.id, orderVersion: order.version,
          customerId: row.customerId, number, series: 'SALE', period, sequence: counter.lastNumber, issuedAt: now.toISOString(), policyVersion: policy.version,
          seller: { name: policy.sellerName, address: policy.sellerAddress, contact: policy.sellerContact },
          taxPolicy: { treatment: policy.taxTreatment, rateBps: policy.taxRateBps, exemptionReason: policy.exemptionReason, shippingTaxable: policy.shippingTaxable },
          buyerLabel: row.buyerLabel, address: draft.address, note: row.note, shipping: draft.shipping, pricePolicyRevision: row.pricePolicyRevision,
          quote: draft.quote, lines: draft.lines.map((line, index) => {
            const original = order.items[index]; const parts = draft.quote!.lines[index];
            return { orderItemId: original.id, variantId: line.variantId, sku: line.sku, title: line.title, quantity: line.quantity,
              unitPrice: line.unitPrice, discount: parts.discount, netAmount: parts.netAmount, tax: parts.tax, total: parts.total };
          }) };
        const stored = await tx.invoiceDocument.create({ data: { id, draftId, draftVersion: document.draftVersion, orderId: order.id, orderVersion: order.version,
          customerId: row.customerId, policyRevisionId: policy.id, series: 'SALE', period, sequence: counter.lastNumber, number,
          subtotal: BigInt(document.quote.subtotal.amount), discount: BigInt(document.quote.discount.amount), shipping: BigInt(document.quote.shipping.amount),
          netAmount: BigInt(document.quote.netAmount.amount), tax: BigInt(document.quote.tax.amount), grandTotal: BigInt(document.quote.total.amount),
          snapshot: document as unknown as Prisma.InputJsonObject, payloadHash: hash(document), issuedById: actorId, issuedAt: now,
          lines: { create: document.lines.map((line, ordinal) => ({ orderItemId: line.orderItemId, ordinal, variantId: line.variantId, sku: line.sku, title: line.title, quantity: line.quantity,
            unitPrice: BigInt(line.unitPrice.amount), discount: BigInt(line.discount.amount), netAmount: BigInt(line.netAmount.amount), tax: BigInt(line.tax.amount), total: BigInt(line.total.amount) })) } } });
        const sealed = await tx.invoiceDraft.update({ where: { id: draftId }, data: { state: 'ISSUED', version: { increment: 1 } }, include: draftInclude });
        await tx.invoiceDraftRevision.create({ data: { draftId, version: sealed.version, action: 'ISSUED', actorId, requestId,
          snapshot: { storage: invoiceDraftStorage(sealed), document: { ...draft, state: 'ISSUED', version: sealed.version } } as unknown as Prisma.InputJsonObject } });
        await tx.invoiceDocumentEvent.create({ data: { documentId: id, action: 'ISSUED', actorId, requestId, createdAt: now } });
        await tx.invoiceIssueCommand.create({ data: { actorId, draftId, keyHash, payloadHash, documentId: id, committedVersion: sealed.version } });
        await this.audit.record({ actorId, requestId, action: 'invoice.document.issued', entityType: 'invoice_document', entityId: id,
          metadata: { number, draftId, draftVersion: sealed.version, orderId: order.id, orderVersion: order.version, policyVersion: policy.version } }, tx);
        return { document: view(stored), committedVersion: sealed.version, replayed: false };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }),
    }); } catch (error) { return this.safeFailure(error); }
  }
  private safeFailure(error: unknown): never {
    if (error instanceof HttpException) throw error;
    new RedactedLogger().event('error', { event: 'invoice.issue.failed', outcome: 'unknown', errorCode: 'INVOICE_ISSUE_UNAVAILABLE' });
    throw new InternalServerErrorException({ code: 'INVOICE_ISSUE_UNAVAILABLE', message: 'Invoice outcome could not be confirmed; reconcile before retrying.' });
  }
}
