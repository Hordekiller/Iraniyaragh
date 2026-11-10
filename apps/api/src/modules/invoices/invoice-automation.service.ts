import { BadRequestException, ConflictException, HttpException, Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { InvoiceAutomationConfig, InvoiceAutomationUpdate } from '@iranyaragh/contracts';
import { PrismaService } from '../../database/prisma.service';
import { RedactedLogger } from '../../common/redacted-logger';
import { AuditLogService } from '../audit/audit-log.service';
import { AuthPermissionService } from '../auth/auth-permission.service';
import { InvoiceDocumentService } from './invoice-document.service';
import { InvoiceDraftService } from './invoice-draft.service';
import { InvoicePublicationService } from './invoice-publication.service';

export const INVOICE_AUTOMATION_FLAG = 'invoice-automation';
export const INVOICE_AUTOMATION_AUDIT_ACTION = 'invoice.automation.updated';
/** Every permission a staff member needs to do by hand what the automation does on their authority. */
export const INVOICE_AUTOMATION_PERMISSIONS = ['invoices.read', 'invoices.manage', 'invoices.issue', 'invoices.publish'] as const;
export const INVOICE_AUTOMATION_REQUEST_PREFIX = 'invoice-automation:';
const PUBLICATION_REASON = 'انتشار خودکار فاکتور پس از پرداخت سفارش';
const COUNT_CAP = 1000;
const BATCH_DEFAULT = 20;
const RETRY_BASE_MS = 5 * 60 * 1000;
const RETRY_MAX_MS = 6 * 60 * 60 * 1000;

export type InvoiceAutomationSweep = {
  status: 'disabled' | 'unauthorized' | 'policy-required' | 'ran';
  considered: number; issued: number; published: number; failed: number;
};
type Outcome = { issued: boolean; published: boolean };

export function validateInvoiceAutomationUpdate(input: InvoiceAutomationUpdate): InvoiceAutomationUpdate {
  if (!Number.isSafeInteger(input?.expectedVersion) || input.expectedVersion < 0 || typeof input.enabled !== 'boolean') {
    throw new BadRequestException({ code: 'INVALID_REQUEST', message: 'expectedVersion and enabled are required.' });
  }
  return { expectedVersion: input.expectedVersion, enabled: input.enabled };
}
const errorCode = (error: unknown): string => {
  if (error instanceof HttpException) {
    const response = error.getResponse();
    if (response && typeof response === 'object' && typeof (response as { code?: unknown }).code === 'string') return (response as { code: string }).code;
  }
  return 'INVOICE_AUTOMATION_UNAVAILABLE';
};

/**
 * Issues and publishes the original store invoice of every paid order that has
 * none, through the same draft, issuance and publication commands staff use.
 *
 * Nothing here computes money, numbers an invoice or writes a document itself:
 * each step is the existing audited command with a deterministic idempotency key,
 * so a crash or a repeated pass converges on one draft, one invoice and one
 * publication per order. The acting identity is the operator who switched the
 * automation on; if that person can no longer issue and publish invoices, the
 * automation stops until an authorized operator enables it again.
 */
@Injectable()
export class InvoiceAutomationService {
  private readonly logger = new RedactedLogger();
  /** Process-local back-off so one order that cannot be invoiced does not starve the others. */
  private readonly deferred = new Map<string, { until: number; attempts: number }>();

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditLogService) private readonly audit: AuditLogService,
    @Inject(AuthPermissionService) private readonly permissions: AuthPermissionService,
    @Inject(InvoiceDraftService) private readonly drafts: InvoiceDraftService,
    @Inject(InvoiceDocumentService) private readonly documents: InvoiceDocumentService,
    @Inject(InvoicePublicationService) private readonly publications: InvoicePublicationService,
  ) {}

  async readAdmin(): Promise<InvoiceAutomationConfig> {
    const row = await this.prisma.storefrontFeatureFlag.findUnique({ where: { key: INVOICE_AUTOMATION_FLAG } });
    const [policyReady, pendingOrders, unpublishedInvoices] = await Promise.all([
      this.policyReady(),
      this.prisma.order.count({ where: this.eligibleOrders(), take: COUNT_CAP }),
      this.prisma.invoiceDocument.count({ where: this.unpublishedDocuments(), take: COUNT_CAP }),
    ]);
    return {
      enabled: row?.enabled ?? false, version: row?.version ?? 0, updatedAt: row?.updatedAt.toISOString() ?? null,
      authorizedById: row?.enabled ? await this.authorizingActor(this.prisma) : null, policyReady, pendingOrders, unpublishedInvoices,
    };
  }

  async update(actorId: string, requestId: string, raw: InvoiceAutomationUpdate): Promise<InvoiceAutomationConfig> {
    const input = validateInvoiceAutomationUpdate(raw);
    await this.prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(1768846945, 1635087471)`;
      const current = await tx.storefrontFeatureFlag.findUnique({ where: { key: INVOICE_AUTOMATION_FLAG } });
      if ((current?.version ?? 0) !== input.expectedVersion) {
        throw new ConflictException({ code: 'STALE_VERSION', message: 'The invoice automation setting changed; reload before saving.' });
      }
      const before = { enabled: current?.enabled ?? false, version: current?.version ?? 0 };
      const row = current
        ? await tx.storefrontFeatureFlag.update({ where: { key: INVOICE_AUTOMATION_FLAG }, data: { enabled: input.enabled, version: current.version + 1 } })
        : await tx.storefrontFeatureFlag.create({ data: { key: INVOICE_AUTOMATION_FLAG, enabled: input.enabled, version: 1 } });
      await this.audit.record({ actorId, requestId, action: INVOICE_AUTOMATION_AUDIT_ACTION, entityType: 'storefront_feature_flag',
        entityId: INVOICE_AUTOMATION_FLAG, before, after: { enabled: row.enabled, version: row.version } }, tx);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 5000, maxWait: 2000 });
    this.deferred.clear();
    return this.readAdmin();
  }

  /** One bounded pass. Safe to run concurrently and repeatedly; every command is idempotent. */
  async sweep(limit = BATCH_DEFAULT, now: Date = new Date()): Promise<InvoiceAutomationSweep> {
    const result: InvoiceAutomationSweep = { status: 'ran', considered: 0, issued: 0, published: 0, failed: 0 };
    const flag = await this.prisma.storefrontFeatureFlag.findUnique({ where: { key: INVOICE_AUTOMATION_FLAG }, select: { enabled: true } });
    if (!flag?.enabled) return { ...result, status: 'disabled' };
    const actorId = await this.authorizedActor(now);
    if (!actorId) {
      this.logger.event('warn', { event: 'invoice.automation.unauthorized', outcome: 'failure', errorCode: 'INVOICE_AUTOMATION_UNAUTHORIZED' });
      return { ...result, status: 'unauthorized' };
    }
    // Without an approved, active seller/tax policy nothing can be issued; do not even open drafts.
    if (!(await this.policyReady())) return { ...result, status: 'policy-required' };
    const bounded = Math.min(Math.max(Math.trunc(limit) || BATCH_DEFAULT, 1), 100);
    for (const [orderId, entry] of this.deferred) if (entry.until <= now.getTime()) this.deferred.set(orderId, { ...entry, until: 0 });
    const skip = [...this.deferred].filter(([, entry]) => entry.until > now.getTime()).map(([orderId]) => orderId);

    // Invoices the automation issued earlier but could not make visible (for example a crash between the two commands).
    const unpublished = await this.prisma.invoiceDocument.findMany({
      where: { ...this.unpublishedDocuments(), orderId: { notIn: skip } }, orderBy: [{ issuedAt: 'asc' }, { id: 'asc' }], take: bounded, select: { id: true, orderId: true } });
    for (const document of unpublished) {
      result.considered += 1;
      await this.attempt(document.orderId, now, result, async () => ({ issued: false, published: await this.publish(actorId, document.orderId, document.id) }));
    }
    const orders = await this.prisma.order.findMany({
      where: { ...this.eligibleOrders(), id: { notIn: skip } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: bounded, select: { id: true, version: true } });
    for (const order of orders) {
      result.considered += 1;
      await this.attempt(order.id, now, result, () => this.invoice(actorId, order.id, order.version));
    }
    if (result.considered > 0) {
      this.logger.event('info', { event: 'invoice.automation.pass', outcome: result.failed ? 'failure' : 'success',
        data: { considered: result.considered, issued: result.issued, published: result.published, failed: result.failed } });
    }
    return result;
  }

  private async policyReady(): Promise<boolean> {
    const latest = await this.prisma.invoicePolicyRevision.findFirst({ orderBy: { version: 'desc' }, select: { isActive: true } });
    return latest?.isActive === true;
  }
  private eligibleOrders(): Prisma.OrderWhereInput {
    // PAID only: the automation never invoices an unpaid, cancelled or returned sale.
    return { status: 'PAID', customer: { status: 'ACTIVE' }, invoiceDocument: null };
  }
  private unpublishedDocuments(): Prisma.InvoiceDocumentWhereInput {
    // Only documents the automation issued and nobody has ever published or revoked. A staff decision is never overridden.
    return { publication: null, order: { status: 'PAID' }, customer: { status: 'ACTIVE' },
      events: { some: { action: 'ISSUED', requestId: { startsWith: INVOICE_AUTOMATION_REQUEST_PREFIX } } } };
  }

  private async attempt(orderId: string, now: Date, result: InvoiceAutomationSweep, work: () => Promise<Outcome>): Promise<void> {
    try {
      const outcome = await work();
      if (outcome.issued) result.issued += 1;
      if (outcome.published) result.published += 1;
      this.deferred.delete(orderId);
    } catch (error) {
      result.failed += 1;
      const attempts = (this.deferred.get(orderId)?.attempts ?? 0) + 1;
      this.deferred.set(orderId, { attempts, until: now.getTime() + Math.min(RETRY_BASE_MS * 2 ** (attempts - 1), RETRY_MAX_MS) });
      // Only the stable machine code and the opaque order id: never invoice text, amounts or customer data.
      this.logger.event('warn', { event: 'invoice.automation.order_failed', outcome: 'failure', errorCode: errorCode(error), entityRef: orderId });
    }
  }

  private async invoice(actorId: string, orderId: string, orderVersion: number): Promise<Outcome> {
    const requestId = `${INVOICE_AUTOMATION_REQUEST_PREFIX}${orderId}`;
    // A draft a staff member is already working on is theirs to issue; the automation waits for it.
    const open = await this.prisma.invoiceDraft.findFirst({ where: { sourceOrderId: orderId, state: 'DRAFT' }, orderBy: { createdAt: 'desc' },
      select: { id: true, revisions: { where: { action: 'CREATED' }, select: { requestId: true } } } });
    let draftId: string;
    if (open) {
      if (!open.revisions.some(revision => revision.requestId === requestId)) {
        throw new ConflictException({ code: 'INVOICE_DRAFT_EXISTS', message: 'A staff draft is open for this order.' });
      }
      draftId = open.id;
    } else {
      draftId = (await this.drafts.fromOrder(actorId, requestId, orderId, { expectedOrderVersion: orderVersion, note: null }, `automation-draft-${orderId}-v${orderVersion}`)).draft.id;
    }
    let draft = await this.drafts.read(draftId);
    // The seller/tax policy or the order version moved since this automatic draft was opened: refresh it through the audited requote.
    if (draft.state === 'DRAFT' && draft.quotationStatus !== 'CURRENT') {
      draft = (await this.drafts.requote(actorId, requestId, draftId, draft.version, `automation-requote-${draftId}-v${draft.version}`)).draft;
    }
    if (draft.state !== 'DRAFT' || draft.sourceOrderVersion === null) throw new ConflictException({ code: 'INVOICE_ISSUE_CONFLICT', message: 'The automatic draft is not issuable.' });
    const issued = await this.documents.issue(actorId, requestId, draftId,
      { expectedVersion: draft.version, expectedOrderVersion: draft.sourceOrderVersion }, `automation-issue-${orderId}`);
    return { issued: !issued.replayed, published: await this.publish(actorId, orderId, issued.document.id) };
  }

  private async publish(actorId: string, orderId: string, documentId: string): Promise<boolean> {
    const result = await this.publications.change(actorId, `${INVOICE_AUTOMATION_REQUEST_PREFIX}${orderId}`, documentId,
      { expectedVersion: 0, isPublished: true, reason: PUBLICATION_REASON }, `automation-publish-${documentId}`);
    return !result.replayed;
  }

  private async authorizingActor(client: Pick<PrismaService, 'auditLog'>): Promise<string | null> {
    const entry = await client.auditLog.findFirst({ where: { action: INVOICE_AUTOMATION_AUDIT_ACTION, entityType: 'storefront_feature_flag', entityId: INVOICE_AUTOMATION_FLAG },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { actorId: true, after: true } });
    const enabled = entry?.after && typeof entry.after === 'object' && (entry.after as { enabled?: unknown }).enabled === true;
    return enabled ? entry.actorId : null;
  }
  /** The enabling operator, only while still an active staff user holding every invoice permission. */
  private async authorizedActor(now: Date): Promise<string | null> {
    const actorId = await this.authorizingActor(this.prisma);
    if (!actorId) return null;
    const user = await this.prisma.user.findUnique({ where: { id: actorId }, select: { status: true } });
    if (user?.status !== 'ACTIVE') return null;
    const granted = await this.permissions.effectivePermissionKeys(actorId, now);
    return INVOICE_AUTOMATION_PERMISSIONS.every(permission => granted.has(permission)) ? actorId : null;
  }
}
