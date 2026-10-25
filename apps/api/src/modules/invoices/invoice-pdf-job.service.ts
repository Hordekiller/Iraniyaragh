import {
  BadRequestException,
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import type { InvoicePdfRequestResult } from '@iranyaragh/contracts';
import { PrismaService } from '../../database/prisma.service';
import { AuditLogService } from '../audit/audit-log.service';
import { normalizeIdempotencyKey } from '../../common/idempotency-key';
import { RedactedLogger } from '../../common/redacted-logger';
import {
  isPrismaTransactionConflict,
  withSerializableRetry,
} from '../../common/serializable-retry';
import { invoiceDraftId } from './invoice-draft.validation';
import { invoiceInvalid } from './invoice-policy.validation';
import { customerInvoice } from './invoice-publication.service';
import {
  INVOICE_PDF_ASSETS,
  INVOICE_PDF_LIMITS,
  INVOICE_PDF_TEMPLATE_REVISION,
} from './invoice-pdf-template';
import { InvoicePdfArtifactStore } from './invoice-pdf-artifact.store';
import { INVOICE_PDF_QUEUE, type InvoicePdfQueue } from './invoice-pdf-queue.port';

export const INVOICE_PDF_RENDERER_REVISION = 'invoice-pdf-jobs-2';
// Bounded lease and attempts keep restart recovery honest without unbounded work.
export const INVOICE_PDF_MAX_ATTEMPTS = 5;
export const INVOICE_PDF_LEASE_SECONDS = 45;

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const missing = () =>
  new NotFoundException({ code: 'INVOICE_DOCUMENT_NOT_FOUND', message: 'Invoice document does not exist.' });
const disabled = () =>
  new BadRequestException({ code: 'INVOICE_PDF_DISABLED', message: 'Approved private invoice PDF rendering is not enabled.' });
const notReady = (message: string) =>
  new ConflictException({ code: 'INVOICE_PDF_NOT_READY', message });
const unavailable = () =>
  new ServiceUnavailableException({ code: 'INVOICE_PDF_STORAGE_UNAVAILABLE', message: 'Private invoice PDF render evidence could not be confirmed; reconcile before retrying.' });

export const INVOICE_PDF_FAILURE_CODES = ['RENDER_FAILED', 'RENDER_TIMEOUT', 'RENDER_UNAVAILABLE', 'STORE_REJECTED'] as const;
export type InvoicePdfFailureCode = (typeof INVOICE_PDF_FAILURE_CODES)[number];

// Rendering identity is bound to the immutable issued projection: staff and
// customer share one deterministic artifact per issued document.
export function customerRenderInput(snapshot: unknown) {
  return customerInvoice(snapshot as never);
}
export function renderInputHash(document: { snapshot: unknown }): string {
  return hash(customerInvoice(document.snapshot as never));
}
export type InvoicePdfArtifactIdentity = {
  documentId: string;
  renderInputHash: string;
  rendererRevision: string;
  templateRevision: string;
  fontSha256: string;
};
export function artifactIdentity(documentId: string, renderInputHash: string): InvoicePdfArtifactIdentity {
  return {
    documentId,
    renderInputHash,
    rendererRevision: INVOICE_PDF_RENDERER_REVISION,
    templateRevision: INVOICE_PDF_TEMPLATE_REVISION,
    fontSha256: INVOICE_PDF_ASSETS.fontSha256,
  };
}

export type InvoicePdfDownload = {
  bytes: Buffer;
  pdfSha256: string;
  byteCount: number;
  number: string;
  filename: string;
};

export type InvoicePdfClaimedJob = InvoicePdfArtifactIdentity & {
  jobId: string;
  leaseVersion: number;
  attempts: number;
  documentPayloadHash: string;
};

type RequestFactor = {
  scope: 'staff' | 'customer';
  actorId: string;
  requestId: string;
  documentId: string;
  key: string;
};

type StatusFactor = {
  scope: 'staff' | 'customer';
  actorId: string;
  documentId: string;
};

const DOCUMENT_SELECT = {
  id: true,
  number: true,
  snapshot: true,
  payloadHash: true,
  customer: { select: { userId: true, status: true } },
  publication: { select: { isPublished: true, version: true } },
} as const;

@Injectable()
export class InvoicePdfJobService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditLogService) private readonly audit: AuditLogService,
    @Inject(InvoicePdfArtifactStore) private readonly store: InvoicePdfArtifactStore,
    @Inject(INVOICE_PDF_QUEUE) private readonly queue: InvoicePdfQueue,
  ) {}

  /** Staff/customer render request. Authorization was checked at the controller. */
  async request(factor: RequestFactor): Promise<InvoicePdfRequestResult> {
    const { scope, actorId, documentId } = factor;
    invoiceDraftId(documentId);
    const requestId = typeof factor.requestId === 'string' ? factor.requestId.trim() : '';
    if (!actorId || !requestId || requestId.length > 100) throw invoiceInvalid('A tracked actor/request identity is required.');
    const key = normalizeIdempotencyKey(factor.key);
    if (!key) throw invoiceInvalid('A bounded idempotency key is required.');
    const keyHash = hash(key);
    const payloadHash = hash({ action: `invoice-pdf:${scope}`, documentId });
    let dispatchedJobId: string | null = null;
    try {
      const outcome = await withSerializableRetry({
        isContention: isPrismaTransactionConflict,
        conflictMessage: 'PDF requests changed concurrently; reconcile with the same key.',
        operation: (): Promise<InvoicePdfRequestResult> => this.prisma.$transaction(async (tx): Promise<InvoicePdfRequestResult> => {
          const prior = await tx.invoicePdfRenderJobCommand.findUnique({
            where: { scope_actorId_documentId_keyHash: { scope, actorId, documentId, keyHash } },
            include: { job: { select: { id: true, status: true, renderInputHash: true } } },
          });
          if (prior) {
            if (prior.payloadHash !== payloadHash) {
              throw new ConflictException({ code: 'IDEMPOTENCY_CONFLICT', message: 'PDF request replay payload changed.' });
            }
            if (prior.job.status === 'READY') {
              const artifact = await tx.invoicePdfArtifact.findUnique({
                where: { documentId_renderInputHash_rendererRevision_templateRevision_fontSha256: artifactIdentity(documentId, prior.job.renderInputHash) },
                select: { pdfSha256: true, byteCount: true },
              });
              return { documentId, status: 'READY', sha256: artifact?.pdfSha256 ?? null, byteCount: artifact?.byteCount ?? null, replayed: true };
            }
            if (prior.job.status === 'FAILED') {
              // A failed attempt is never repackaged as pending progress; the
              // caller must explicitly retry with a fresh idempotency key.
              throw notReady('The earlier render attempt failed; repeat the request to retry within capacity.');
            }
            return { documentId, status: 'PENDING', sha256: null, byteCount: null, replayed: true };
          }
          // Singleton capacity lock: different input keys cannot overbook the
          // pending slot or bypass the disabled control.
          const locked = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "InvoicePdfStorageCapacity" WHERE "id" = 'invoice-pdf' FOR UPDATE`;
          if (!locked.length) throw disabled();
          const capacity = await tx.invoicePdfStorageCapacity.findUnique({ where: { id: 'invoice-pdf' } });
          if (!capacity?.isEnabled || capacity.maxPendingJobs < 1) throw disabled();
          const document = await tx.invoiceDocument.findUnique({ where: { id: documentId }, select: DOCUMENT_SELECT });
          if (!document) throw missing();
          if (scope === 'customer') {
            if (document.customer.userId !== actorId || document.customer.status !== 'ACTIVE' || !document.publication?.isPublished) throw missing();
          }
          const inputHash = renderInputHash(document);
          const artifact = await tx.invoicePdfArtifact.findUnique({
            where: { documentId_renderInputHash_rendererRevision_templateRevision_fontSha256: artifactIdentity(documentId, inputHash) },
            select: { id: true, pdfSha256: true, byteCount: true },
          });
          if (artifact) {
            return { documentId, status: 'READY', sha256: artifact.pdfSha256, byteCount: artifact.byteCount, replayed: false };
          }
          const active = await tx.invoicePdfRenderJob.findFirst({
            where: { documentId, renderInputHash: inputHash, status: { in: ['PENDING', 'RUNNING'] } },
            select: { id: true },
          });
          let jobId: string;
          if (active) {
            jobId = active.id;
          } else {
            if (capacity.pendingJobCount >= capacity.maxPendingJobs) {
              throw new ConflictException({ code: 'INVOICE_PDF_CAPACITY_EXCEEDED', message: 'Approved pending PDF work capacity is exhausted.' });
            }
            const created = await tx.invoicePdfRenderJob.create({ data: {
              documentId,
              documentPayloadHash: document.payloadHash,
              renderInputHash: inputHash,
              rendererRevision: INVOICE_PDF_RENDERER_REVISION,
              templateRevision: INVOICE_PDF_TEMPLATE_REVISION,
              fontSha256: INVOICE_PDF_ASSETS.fontSha256,
              status: 'PENDING',
              requestedByUserId: actorId,
              requestedByScope: scope,
              requestKeyHash: keyHash,
              payloadHash } });
            await tx.invoicePdfStorageCapacity.update({ where: { id: 'invoice-pdf' }, data: { pendingJobCount: { increment: 1 }, version: { increment: 1 } } });
            jobId = created.id;
          }
          dispatchedJobId = jobId;
          const command = await tx.invoicePdfRenderJobCommand.create({ data: {
            documentId, actorId, scope, keyHash, payloadHash, jobId, outcome: 'PENDING' } });
          await this.audit.record({
            actorId, action: 'invoice.pdf.requested', entityType: 'InvoicePdfRenderJobCommand', entityId: command.id, requestId,
            metadata: { documentId, scope, replayed: false } }, tx);
          return { documentId, status: 'PENDING', sha256: null, byteCount: null, replayed: false };
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }),
      });
      // Durable dispatch after commit: a retained queue entry replays against
      // database eligibility, so a lost enqueue is reconcilable by re-request.
      if (dispatchedJobId) {
        await this.queue.enqueue(dispatchedJobId);
      }
      return outcome;
    } catch (error) {
      return this.safeFailure(error);
    }
  }

  /** Status read for polling clients; current authorization reread each time. */
  async status(factor: StatusFactor): Promise<InvoicePdfRequestResult> {
    const { scope, actorId, documentId } = factor;
    invoiceDraftId(documentId);
    try {
      const document = await this.prisma.invoiceDocument.findUnique({ where: { id: documentId }, select: DOCUMENT_SELECT });
      if (!document) throw missing();
      if (scope === 'customer' && (document.customer.userId !== actorId || document.customer.status !== 'ACTIVE' || !document.publication?.isPublished)) throw missing();
      const inputHash = renderInputHash(document);
      const artifact = await this.prisma.invoicePdfArtifact.findUnique({
        where: { documentId_renderInputHash_rendererRevision_templateRevision_fontSha256: artifactIdentity(documentId, inputHash) },
        select: { pdfSha256: true, byteCount: true },
      });
      if (artifact) return { documentId, status: 'READY', sha256: artifact.pdfSha256, byteCount: artifact.byteCount, replayed: false };
      const job = await this.prisma.invoicePdfRenderJob.findFirst({
        where: { documentId, renderInputHash: inputHash, status: { in: ['PENDING', 'RUNNING'] } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });
      if (!job) {
        const failed = await this.prisma.invoicePdfRenderJob.findFirst({
          where: { documentId, renderInputHash: inputHash, status: 'FAILED' },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        });
        throw notReady(failed ? 'The stored render attempt failed; a new request retries with fresh evidence.' : 'No authoritative PDF artifact exists for this document yet.');
      }
      return { documentId, status: 'PENDING', sha256: null, byteCount: null, replayed: false };
    } catch (error) {
      return this.safeFailure(error);
    }
  }

  /** Authoritative private download; never returns bytes before READY. */
  private async download(factor: { scope: 'staff' | 'customer'; actorId: string; documentId: string }): Promise<InvoicePdfDownload> {
    const { scope, actorId, documentId } = factor;
    invoiceDraftId(documentId);
    try {
      const where = scope === 'staff'
        ? { id: documentId }
        : { id: documentId, customer: { userId: actorId, status: 'ACTIVE' as const }, publication: { isPublished: true } };
      const document = await this.prisma.invoiceDocument.findFirst({
        where, select: { id: true, number: true, snapshot: true, payloadHash: true },
      });
      if (!document) throw missing();
      const inputHash = renderInputHash(document);
      const artifact = await this.prisma.invoicePdfArtifact.findUnique({
        where: { documentId_renderInputHash_rendererRevision_templateRevision_fontSha256: artifactIdentity(documentId, inputHash) },
        select: { pdfSha256: true, byteCount: true, bytes: true },
      });
      if (!artifact) throw notReady('No authoritative PDF artifact exists for this document yet.');
      const bytes = Buffer.from(artifact.bytes);
      // Stored-integrity verification on every download; not the projection.
      if (createHash('sha256').update(bytes).digest('hex') !== artifact.pdfSha256
        || bytes.length !== artifact.byteCount
        || bytes.length < 5 || bytes.length > INVOICE_PDF_LIMITS.pdfBytes
        || !bytes.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
        throw unavailable();
      }
      return {
        bytes,
        pdfSha256: artifact.pdfSha256,
        byteCount: artifact.byteCount,
        number: document.number,
        filename: `iranyaragh-invoice-${document.number}.pdf`,
      };
    } catch (error) {
      return this.safeFailure(error);
    }
  }

  async downloadStaff(documentId: string): Promise<InvoicePdfDownload> {
    return this.download({ scope: 'staff', actorId: '', documentId });
  }

  async downloadCustomer(userId: string, documentId: string): Promise<InvoicePdfDownload> {
    return this.download({ scope: 'customer', actorId: userId, documentId });
  }

  /** Lease claim used by the dedicated render worker. */
  async claim(workerId: string): Promise<InvoicePdfClaimedJob | null> {
    if (typeof workerId !== 'string' || !/^[a-zA-Z0-9_-]{4,64}$/u.test(workerId)) throw invoiceInvalid('A durable render worker lease identity is required.');
    try {
      return await withSerializableRetry({
        isContention: isPrismaTransactionConflict,
        conflictMessage: 'Render lease contention; retry the claim.',
        operation: () => this.prisma.$transaction(async (tx) => {
          const capacity = await tx.invoicePdfStorageCapacity.findUnique({ where: { id: 'invoice-pdf' } });
          if (!capacity?.isEnabled) return null;
          const now = new Date();
          const leaseExpireAt = new Date(now.getTime() + INVOICE_PDF_LEASE_SECONDS * 1000);
          const candidate = await tx.$queryRaw<Array<{ id: string }>>`
            SELECT "id" FROM "InvoicePdfRenderJob"
            WHERE ("status" = 'PENDING' AND "attempts" < ${INVOICE_PDF_MAX_ATTEMPTS})
               OR ("status" = 'RUNNING' AND "leaseExpireAt" < ${now} AND "attempts" < ${INVOICE_PDF_MAX_ATTEMPTS})
            ORDER BY "createdAt" ASC, "id" ASC
            LIMIT 1 FOR UPDATE SKIP LOCKED`;
          const id = candidate[0]?.id;
          if (!id) return null;
          const claimed = await tx.$queryRaw<Array<{
            id: string; leaseVersion: number; attempts: number; documentId: string;
            documentPayloadHash: string; renderInputHash: string;
            rendererRevision: string; templateRevision: string; fontSha256: string;
          }>>`
            UPDATE "InvoicePdfRenderJob" SET
              "status" = 'RUNNING', "leaseVersion" = "leaseVersion" + 1,
              "leaseOwner" = ${workerId}, "leaseIssuedAt" = ${now}, "leaseExpireAt" = ${leaseExpireAt},
              "attempts" = "attempts" + 1, "updatedAt" = ${now}
            WHERE "id" = ${id}
            RETURNING "id", "leaseVersion", "attempts", "documentId", "documentPayloadHash",
              "renderInputHash", "rendererRevision", "templateRevision", "fontSha256"`;
          const row = claimed[0];
          if (!row) return null;          return {
            jobId: row.id,
            leaseVersion: row.leaseVersion,
            attempts: row.attempts,
            documentId: row.documentId,
            documentPayloadHash: row.documentPayloadHash,
            renderInputHash: row.renderInputHash,
            rendererRevision: row.rendererRevision,
            templateRevision: row.templateRevision,
            fontSha256: row.fontSha256,
          };
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }),
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      return null;
    }
  }

  /** Ready completion from the worker: store bytes under the lease, then close the job. */
  async completeRender(identity: InvoicePdfClaimedJob, bytes: Buffer, requestId: string): Promise<'READY' | 'STALE' | 'STORE_FAILED'> {
    if (!Buffer.isBuffer(bytes) || bytes.length < 5 || bytes.length > INVOICE_PDF_LIMITS.pdfBytes
      || !bytes.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
      throw new ConflictException({ code: 'INVOICE_PDF_ARTIFACT_INVALID', message: 'Rendered PDF identity or bounds failed.' });
    }
    try {
      const stored = await this.store.persist({
        documentId: identity.documentId,
        documentPayloadHash: identity.documentPayloadHash,
        renderInputHash: identity.renderInputHash,
        rendererRevision: identity.rendererRevision,
        templateRevision: identity.templateRevision,
        fontSha256: identity.fontSha256,
        bytes,
      }, requestId);
      const settled = await withSerializableRetry({
        isContention: isPrismaTransactionConflict,
        conflictMessage: 'PDF completion contention; reconcile.',
        operation: () => this.prisma.$transaction(async (tx) => {
          const job = await tx.invoicePdfRenderJob.findUnique({
            where: { id: identity.jobId },
            select: { id: true, leaseVersion: true, status: true, documentId: true, renderInputHash: true, attempts: true },
          });
          if (!job || job.leaseVersion !== identity.leaseVersion || job.status !== 'RUNNING'
            || job.documentId !== identity.documentId) return false;
          await tx.invoicePdfRenderJob.update({
            where: { id: job.id },
            data: { status: 'READY', leaseOwner: null, leaseIssuedAt: null, leaseExpireAt: null, failureReason: null } });
          await tx.invoicePdfStorageCapacity.update({ where: { id: 'invoice-pdf' }, data: { pendingJobCount: { decrement: 1 }, version: { increment: 1 } } });
          // Command evidence is append-only (draft-immutability guard); READY
          // outcomes live on the job and artifact rows.
          await this.audit.record({
            action: 'invoice.pdf.render.completed', entityType: 'InvoicePdfRenderJob', entityId: job.id, requestId,
            metadata: { documentId: job.documentId, attempts: job.attempts, artifactId: stored.artifact.id } }, tx);
          return true;
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }),
      });
      // A stale lease says so: another owner now carries the completion.
      return settled ? 'READY' : 'STALE';
    } catch (error) {
      // A rejected artifact cannot become READY. The worker converts this into
      // a bounded retryable failure recording; no faked success is returned.
      if (error instanceof HttpException) throw error;
      throw unavailable();
    }
  }

  /** Worker-side bounded failure record; safe codes only, never raw error text. */
  async attemptFailed(jobId: string, leaseVersion: number, finalAttempt: boolean, reason: InvoicePdfFailureCode, requestId: string): Promise<void> {
    if (!INVOICE_PDF_FAILURE_CODES.includes(reason)) throw invoiceInvalid('A bounded failure reason is required.');
    try {
      await withSerializableRetry({
        isContention: isPrismaTransactionConflict,
        conflictMessage: 'Failure recording contention; reconcile.',
        operation: () => this.prisma.$transaction(async (tx) => {
          const job = await tx.invoicePdfRenderJob.findUnique({ where: { id: jobId }, select: { id: true, leaseVersion: true, attempts: true, status: true } });
          if (!job || job.leaseVersion !== leaseVersion || job.status !== 'RUNNING') return null;
          if (finalAttempt) {
            await tx.invoicePdfRenderJob.update({ where: { id: job.id }, data: { status: 'FAILED', failureReason: reason, leaseOwner: null, leaseIssuedAt: null, leaseExpireAt: null } });
            await tx.invoicePdfStorageCapacity.update({ where: { id: 'invoice-pdf' }, data: { pendingJobCount: { decrement: 1 }, version: { increment: 1 } } });
          } else {
            await tx.invoicePdfRenderJob.update({ where: { id: job.id }, data: { status: 'PENDING', leaseOwner: null, leaseIssuedAt: null, leaseExpireAt: null } });
          }
          await this.audit.record({
            action: 'invoice.pdf.render.failed', entityType: 'InvoicePdfRenderJob', entityId: jobId, requestId,
            metadata: { attempt: job.attempts, final: finalAttempt, reason } }, tx);
          return job.id;
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }),
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      // The lease expires and a replay reclaims the claim; no silent false success.
      new RedactedLogger().event('error', { event: 'invoice.pdf.failure.record.failed', outcome: 'unknown', errorCode: 'INVOICE_PDF_STORAGE_UNAVAILABLE' });
      throw unavailable();
    }
  }

  private safeFailure(error: unknown): never {
    if (error instanceof HttpException) throw error;
    new RedactedLogger().event('error', { event: 'invoice.pdf.job.failed', outcome: 'unknown', errorCode: 'INVOICE_PDF_STORAGE_UNAVAILABLE' });
    throw new InternalServerErrorException({ code: 'INVOICE_PDF_STORAGE_UNAVAILABLE', message: 'Invoice PDF outcome could not be confirmed; reconcile before retrying.' });
  }
}
