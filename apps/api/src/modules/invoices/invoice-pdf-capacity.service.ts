import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { InvoicePdfCapacityConfig, InvoicePdfCapacityUpdate } from '@iranyaragh/contracts';
import { PrismaService } from '../../database/prisma.service';
import { AuditLogService } from '../audit/audit-log.service';

export const INVOICE_PDF_CAPACITY_ID = 'invoice-pdf';
export const INVOICE_PDF_CAPACITY_AUDIT_ACTION = 'invoice.pdf.capacity.updated';
/**
 * The contracts workspace exports unbuilt TypeScript, so the compiled API may
 * only import its types. These bounds mirror the contract's
 * INVOICE_PDF_CAPACITY_LIMITS; the HTTP spec asserts they stay equal.
 */
export const INVOICE_PDF_CAPACITY_LIMITS = {
  budgetMegabytes: { min: 1, max: 1024 },
  maxArtifacts: { min: 1, max: 20000 },
  maxPendingJobs: { min: 1, max: 20 },
} as const;
const MEBIBYTE = 1024 * 1024;

type Row = { budgetBytes: bigint; maxArtifacts: number; storedBytes: bigint; artifactCount: number; pendingJobCount: number; maxPendingJobs: number; isEnabled: boolean; version: number };

const within = (value: unknown, range: { min: number; max: number }) => Number.isSafeInteger(value) && (value as number) >= range.min && (value as number) <= range.max;

export function validateInvoicePdfCapacityUpdate(input: InvoicePdfCapacityUpdate): InvoicePdfCapacityUpdate {
  if (!Number.isSafeInteger(input?.expectedVersion) || input.expectedVersion < 0 || typeof input.enabled !== 'boolean'
    || !within(input.budgetMegabytes, INVOICE_PDF_CAPACITY_LIMITS.budgetMegabytes)
    || !within(input.maxArtifacts, INVOICE_PDF_CAPACITY_LIMITS.maxArtifacts)
    || !within(input.maxPendingJobs, INVOICE_PDF_CAPACITY_LIMITS.maxPendingJobs)) {
    throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Invoice PDF capacity is invalid.' });
  }
  return { expectedVersion: input.expectedVersion, enabled: input.enabled, budgetMegabytes: input.budgetMegabytes, maxArtifacts: input.maxArtifacts, maxPendingJobs: input.maxPendingJobs };
}

function view(row: Row | null): InvoicePdfCapacityConfig {
  if (!row) return { configured: false, enabled: false, version: 0, budgetMegabytes: 0, maxArtifacts: 0, maxPendingJobs: 0, storedBytes: 0, artifactCount: 0, pendingJobCount: 0 };
  return {
    configured: true, enabled: row.isEnabled, version: row.version,
    // Rounded down: never report more budget than is approved.
    budgetMegabytes: Number(row.budgetBytes / BigInt(MEBIBYTE)), maxArtifacts: row.maxArtifacts, maxPendingJobs: row.maxPendingJobs,
    storedBytes: Number(row.storedBytes), artifactCount: row.artifactCount, pendingJobCount: row.pendingJobCount,
  };
}

/**
 * The operator approval ADR-0030 requires before any invoice PDF is rendered
 * or stored. Only the approved limits and the on/off switch are written here;
 * the stored/pending counters stay evidence owned by the database triggers.
 */
@Injectable()
export class InvoicePdfCapacityService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService, @Inject(AuditLogService) private readonly audit: AuditLogService) {}

  async read(): Promise<InvoicePdfCapacityConfig> {
    return view(await this.prisma.invoicePdfStorageCapacity.findUnique({ where: { id: INVOICE_PDF_CAPACITY_ID } }));
  }

  async update(actorId: string, requestId: string, raw: InvoicePdfCapacityUpdate): Promise<InvoicePdfCapacityConfig> {
    const input = validateInvoicePdfCapacityUpdate(raw);
    const budgetBytes = BigInt(input.budgetMegabytes) * BigInt(MEBIBYTE);
    return this.prisma.$transaction(async tx => {
      // Serializes the first approval (no row to lock yet) and every later change.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(1768846945, 1885627003)`;
      await tx.$queryRaw`SELECT "id" FROM "InvoicePdfStorageCapacity" WHERE "id" = ${INVOICE_PDF_CAPACITY_ID} FOR UPDATE`;
      const current = await tx.invoicePdfStorageCapacity.findUnique({ where: { id: INVOICE_PDF_CAPACITY_ID } });
      if ((current?.version ?? 0) !== input.expectedVersion) {
        throw new ConflictException({ code: 'STALE_VERSION', message: 'The invoice PDF capacity changed; reload before saving.' });
      }
      if (current && (budgetBytes < current.storedBytes || input.maxArtifacts < current.artifactCount || input.maxPendingJobs < current.pendingJobCount)) {
        throw new ConflictException({ code: 'CAPACITY_BELOW_USAGE', message: 'The approved capacity cannot be lower than what is already stored or pending.' });
      }
      const data = { budgetBytes, maxArtifacts: input.maxArtifacts, maxPendingJobs: input.maxPendingJobs, isEnabled: input.enabled };
      const row = current
        ? await tx.invoicePdfStorageCapacity.update({ where: { id: INVOICE_PDF_CAPACITY_ID }, data: { ...data, version: current.version + 1 } })
        : await tx.invoicePdfStorageCapacity.create({ data: { id: INVOICE_PDF_CAPACITY_ID, ...data } });
      const before = view(current); const after = view(row);
      const limits = (value: InvoicePdfCapacityConfig) => ({ enabled: value.enabled, version: value.version, budgetMegabytes: value.budgetMegabytes, maxArtifacts: value.maxArtifacts, maxPendingJobs: value.maxPendingJobs });
      await this.audit.record({ actorId, requestId, action: INVOICE_PDF_CAPACITY_AUDIT_ACTION, entityType: 'invoice_pdf_storage_capacity',
        entityId: INVOICE_PDF_CAPACITY_ID, before: limits(before), after: limits(after) }, tx);
      return after;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 5000, maxWait: 2000 });
  }
}
