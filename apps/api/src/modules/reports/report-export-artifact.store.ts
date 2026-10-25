import { BadRequestException, ConflictException, HttpException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service';
import { isPrismaTransactionConflict, withSerializableRetry } from '../../common/serializable-retry';
import { AuditLogService } from '../audit/audit-log.service';
import { RedactedLogger } from '../../common/redacted-logger';

export const REPORT_EXPORT_ARTIFACT_MAX_BYTES = 10_485_760;

export const REPORT_EXPORT_RENDERER_REVISION = 'report-export-1';
export const REPORT_EXPORT_FAILURE_CODES = ['RENDER_FAILED', 'RENDER_TIMEOUT', 'RENDER_UNAVAILABLE', 'STORE_REJECTED'] as const;
export type ReportExportFailureCode = (typeof REPORT_EXPORT_FAILURE_CODES)[number];

/** Expiry is stamped by the storage policy, never by the caller of persist. */
export const REPORT_EXPORT_ARTIFACT_RETENTION_MS = 14 * 24 * 60 * 60 * 1000;

type ArtifactInput = {
  jobId: string;
  jobRequestKeyHash: string;
  reportKind: string;
  outputFormat: string;
  definitionHash: string;
  bytes: Buffer;
};

// Never select/return private bytes when reconciling a completed write.
const metadata = { id: true, contentSha256: true, byteCount: true, expiresAt: true } as const;
const unavailable = () => new ServiceUnavailableException({ code: 'REPORT_EXPORT_STORAGE_UNAVAILABLE', message: 'Report export storage is unavailable; reconcile before retrying.' });

const kindPattern = /^(operations-summary|orders|debtors)$/u;
const formatPattern = /^(csv|xlsx)$/u;

/** Internal persistence only. Role checks and job lifecycle live above;
 * byte evidence and its retention stamp live here.
 */
@Injectable()
export class ReportExportArtifactStore {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditLogService) {}

  async persist(input: ArtifactInput, requestId: string) {
    const hashPattern = /^[a-f0-9]{64}$/u;
    if (!input || typeof input.jobId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/u.test(input.jobId)
      || !kindPattern.test(input.reportKind) || !formatPattern.test(input.outputFormat)
      || ![input.jobRequestKeyHash, input.definitionHash].every(value => typeof value === 'string' && hashPattern.test(value))
      || typeof requestId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/u.test(requestId)
      || !Buffer.isBuffer(input.bytes) || input.bytes.length < 1 || input.bytes.length > REPORT_EXPORT_ARTIFACT_MAX_BYTES
      || (input.outputFormat === 'xlsx' && input.bytes.subarray(0, 2).toString('utf8') !== 'PK')) {
      throw new BadRequestException({ code: 'REPORT_EXPORT_ARTIFACT_INVALID', message: 'A bounded export manifest and immutable job identity are required.' });
    }
    // Own the buffer before awaiting: callers cannot mutate evidence in flight.
    const bytes = Buffer.from(input.bytes);
    const contentSha256 = createHash('sha256').update(bytes).digest('hex');
    const metadataInput = {
      jobId: input.jobId,
      jobRequestKeyHash: input.jobRequestKeyHash,
      reportKind: input.reportKind,
      outputFormat: input.outputFormat,
      definitionHash: input.definitionHash,
      rendererRevision: REPORT_EXPORT_RENDERER_REVISION,
      contentSha256,
      byteCount: bytes.length,
    };
    try {
      return await withSerializableRetry({ isContention: isPrismaTransactionConflict,
        conflictMessage: 'Report export storage changed concurrently; reconcile the same immutable job.',
        operation: () => this.prisma.$transaction(async tx => {
          await tx.$queryRaw`SELECT "id" FROM "ReportExportStorageCapacity" WHERE "id" = 'report-export' FOR UPDATE`;
          const prior = await tx.reportExportArtifact.findUnique({ where: { jobId: input.jobId }, select: metadata });
          if (prior) return { artifact: prior, replayed: true };
          const capacity = await tx.reportExportStorageCapacity.findUnique({ where: { id: 'report-export' } });
          if (!capacity?.isEnabled) throw unavailable();
          if (capacity.artifactCount >= capacity.maxArtifacts || BigInt(bytes.length) > capacity.budgetBytes - capacity.storedBytes) {
            throw new ConflictException({ code: 'REPORT_EXPORT_CAPACITY_EXCEEDED', message: 'Approved report export capacity is exhausted.' });
          }
          if (capacity.maxRetentionMs <= 0n || BigInt(REPORT_EXPORT_ARTIFACT_RETENTION_MS) > capacity.maxRetentionMs) {
            throw unavailable();
          }
          const expiresAt = new Date(Date.now() + REPORT_EXPORT_ARTIFACT_RETENTION_MS);
          const artifact = await tx.reportExportArtifact.create({ data: { id: input.jobId, ...metadataInput, bytes, expiresAt }, select: metadata });
          await this.audit.record({ action: 'report.export.stored', entityType: 'ReportExportArtifact', entityId: artifact.id, requestId,
            metadata: { jobId: input.jobId, reportKind: input.reportKind, format: input.outputFormat, byteCount: artifact.byteCount } }, tx);
          return { artifact, replayed: false };
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }),
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      // Driver exceptions may embed SQL or exported rows. Do not log.
      throw unavailable();
    }
  }

  /** Cleanup loops in a dedicated worker transaction delete expired bytes and
   * free the capacity counters; the job and audit rows remain as evidence.
   */
  async cleanupExpired(now: Date, requestId: string): Promise<{ freed: number }> {
    try {
      return await withSerializableRetry({ isContention: isPrismaTransactionConflict,
        conflictMessage: 'Report export cleanup contention; reconcile.',
        operation: () => this.prisma.$transaction(async tx => {
          // A bounded batch per invocation keeps cleanup fair under contention.
          const expired = await tx.reportExportArtifact.findMany({
            where: { expiresAt: { lte: now } },
            select: { id: true, byteCount: true },
            orderBy: { expiresAt: 'asc' },
            take: 100,
          });
          let freed = 0;
          if (expired.length) {
            await tx.$executeRaw`SET LOCAL app.report_export_cleanup = 'on'`;
            for (const artifact of expired) {
              await tx.$executeRaw`DELETE FROM "ReportExportArtifact" WHERE "id" = ${artifact.id}`;
              freed += 1;
            }
            const totalBytes = expired.reduce((sum, artifact) => sum + artifact.byteCount, 0);
            await tx.$executeRaw`UPDATE "ReportExportStorageCapacity" SET
              "storedBytes" = "storedBytes" - ${totalBytes}::bigint,
              "artifactCount" = "artifactCount" - ${expired.length}
              WHERE "id" = 'report-export'`;
            await this.audit.record({ action: 'report.export.expired', entityType: 'ReportExportArtifact', entityId: expired[0]!.id, requestId,
              metadata: { freed, byteCount: totalBytes } }, tx);
          }
          return { freed };
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }),
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      new RedactedLogger().event('error', { event: 'report.export.cleanup.failed', outcome: 'unknown', errorCode: 'REPORT_EXPORT_STORAGE_UNAVAILABLE' });
      throw unavailable();
    }
  }
}
