import { ConflictException, HttpException, Inject, Injectable, InternalServerErrorException } from '@nestjs/common';
import { Prisma, type InvoicePolicyRevision } from '@prisma/client';
import { createHash } from 'node:crypto';
import type { InvoicePolicy, InvoicePolicyUpdate } from '@iranyaragh/contracts';
import { PrismaService } from '../../database/prisma.service';
import { normalizeIdempotencyKey } from '../../common/idempotency-key';
import { isPrismaTransactionConflict, withSerializableRetry } from '../../common/serializable-retry';
import { RedactedLogger } from '../../common/redacted-logger';
import { AuditLogService } from '../audit/audit-log.service';
import { invoiceInvalid, invoicePolicyFields, invoicePolicyUpdate } from './invoice-policy.validation';

const hash = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');
function view(row: InvoicePolicyRevision): InvoicePolicy {
  return { id: row.id, version: row.version, sellerName: row.sellerName, sellerAddress: row.sellerAddress, sellerContact: row.sellerContact,
    taxTreatment: row.taxTreatment, taxRateBps: row.taxRateBps, exemptionReason: row.exemptionReason,
    discountCapBps: row.discountCapBps, shippingTaxable: row.shippingTaxable, isActive: row.isActive, createdAt: row.createdAt.toISOString() };
}

@Injectable()
export class InvoicePolicyService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService, @Inject(AuditLogService) private readonly audit: AuditLogService) {}

  async current(): Promise<InvoicePolicy | null> {
    try {
      const row = await this.prisma.invoicePolicyRevision.findFirst({ orderBy: { version: 'desc' } });
      return row ? view(row) : null;
    } catch (error) { return this.safeFailure(error); }
  }

  /** Issuance must invoke this within its own transaction, never trust a UI policy snapshot. */
  async requireActive(tx: Prisma.TransactionClient): Promise<InvoicePolicy> {
    const row = await tx.invoicePolicyRevision.findFirst({ orderBy: { version: 'desc' } });
    if (!row?.isActive) throw new ConflictException({ code: 'INVOICE_POLICY_REQUIRED', message: 'Configure and activate an approved invoice policy before issuing.' });
    return view(row);
  }

  async update(actorId: string, requestId: string, raw: InvoicePolicyUpdate, idempotencyKey: string): Promise<InvoicePolicy> {
    // Canonical explicitly ordered fields: no key-order/locale dependent hashes.
    const input = invoicePolicyUpdate(raw);
    if (!actorId || typeof requestId !== 'string' || !requestId.trim() || requestId.length > 100) throw invoiceInvalid('A tracked actor and request are required.');
    const keyHash = hash(normalizeIdempotencyKey(idempotencyKey));
    const payloadHash = hash(JSON.stringify(input));
    try {
      return await withSerializableRetry({ isContention: isPrismaTransactionConflict,
        conflictMessage: 'Invoice configuration changed concurrently; reconcile before retrying.',
        operation: () => this.prisma.$transaction(async tx => {
          // Must match the SQL insert trigger so direct writers serialize too.
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(1936608609, 1768842863)`;
          const previous = await tx.invoicePolicyCommand.findUnique({ where: { actorId_keyHash: { actorId, keyHash } }, include: { revision: true } });
          if (previous) {
            if (previous.payloadHash !== payloadHash) throw new ConflictException({ code: 'IDEMPOTENCY_CONFLICT', message: 'Retry key payload changed.' });
            return view(previous.revision);
          }
          const current = await tx.invoicePolicyRevision.findFirst({ orderBy: { version: 'desc' } });
          if ((current?.version ?? null) !== input.expectedVersion) throw new ConflictException({ code: 'STALE_VERSION', message: 'Review the current invoice policy before editing.' });
          const fields = invoicePolicyFields(input);
          const row = await tx.invoicePolicyRevision.create({ data: { ...fields, reason: input.reason, version: (current?.version ?? 0) + 1, actorId, requestId } });
          await tx.invoicePolicyCommand.create({ data: { actorId, keyHash, payloadHash, revisionId: row.id } });
          await this.audit.record({ actorId, requestId, action: 'invoice.policy.revised', entityType: 'invoice_policy', entityId: row.id,
            before: { version: current?.version ?? null }, after: { version: row.version, isActive: row.isActive }, metadata: { changeReasonRecorded: true } }, tx);
          return view(row);
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }),
      });
    } catch (error) { return this.safeFailure(error); }
  }

  private safeFailure(error: unknown): never {
    if (error instanceof HttpException) throw error;
    // Never pass raw Prisma errors (which can include seller/reason input) to the global logger.
    new RedactedLogger().event('error', { event: 'invoice.policy.failed', outcome: 'unknown', errorCode: 'INVOICE_POLICY_UNAVAILABLE' });
    throw new InternalServerErrorException({ code: 'INVOICE_POLICY_UNAVAILABLE', message: 'Invoice configuration could not be confirmed. Reconcile before retrying.' });
  }
}
