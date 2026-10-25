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
import type { ReportExportDefinition, ReportExportRequestResult } from '@iranyaragh/contracts';
import { PrismaService } from '../../database/prisma.service';
import { AuditLogService } from '../audit/audit-log.service';
import { normalizeIdempotencyKey } from '../../common/idempotency-key';
import { RedactedLogger } from '../../common/redacted-logger';
import {
  isPrismaTransactionConflict,
  withSerializableRetry,
} from '../../common/serializable-retry';
import { reportExportId, reportExportInvalid } from './report-export.validation';
import {
  REPORT_EXPORT_ARTIFACT_MAX_BYTES,
  REPORT_EXPORT_FAILURE_CODES,
  type ReportExportFailureCode,
} from './report-export-artifact.store';
import { ReportExportArtifactStore } from './report-export-artifact.store';
import { REPORT_EXPORT_QUEUE, type ReportExportQueue } from './report-export-queue.port';

export const REPORT_EXPORT_MAX_ATTEMPTS = 5;
export const REPORT_EXPORT_LEASE_SECONDS = 45;

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const missing = () =>
  new NotFoundException({ code: 'REPORT_EXPORT_NOT_READY', message: 'Report export does not exist.' });
const notReady = (message: string) =>
  new ConflictException({ code: 'REPORT_EXPORT_NOT_READY', message });
const unavailable = () =>
  new ServiceUnavailableException({ code: 'REPORT_EXPORT_STORAGE_UNAVAILABLE', message: 'Report export outcome could not be confirmed; reconcile before retrying.' });

const kindPattern = /^(operations-summary|orders|debtors)$/u;
const formatPattern = /^(csv|xlsx)$/u;
const workerPattern = /^[a-zA-Z0-9_-]{4,64}$/u;

/** One hash family covers: canonical definition identity, replay payload, keys. */
export function definitionHashOf(definition: ReportExportDefinition): string {
  return hash(definition);
}
export function requestPayloadHash(reportKind: string, outputFormat: string, definitionHash: string): string {
  return hash({ action: 'report-export', reportKind, outputFormat, definitionHash });
}

export type ReportExportDownload = {
  bytes: Buffer;
  contentSha256: string;
  byteCount: number;
  filename: string;
  contentType: string;
};

export type ReportExportClaimedJob = {
  jobId: string;
  leaseVersion: number;
  attempts: number;
  reportKind: string;
  outputFormat: string;
  definitionHash: string;
  rendererRevision: string;
  requestKeyHash: string;
  definition: ReportExportDefinition;
};

export const REPORT_EXPORT_MIME: Record<string, string> = {
  csv: 'text/csv; charset=utf-8',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};
const EXTENSION: Record<string, string> = { csv: 'csv', xlsx: 'xlsx' };
const KIND_SLUG: Record<string, string> = {
  'operations-summary': 'operations-summary',
  orders: 'orders',
  debtors: 'debtors',
};

type RequestFactor = {
  actorId: string;
  requestId: string;
  definition: ReportExportDefinition;
  outputFormat: string;
  key: string;
};

@Injectable()
export class ReportExportJobService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditLogService) private readonly audit: AuditLogService,
    @Inject(ReportExportArtifactStore) private readonly store: ReportExportArtifactStore,
    @Inject(REPORT_EXPORT_QUEUE) private readonly queue: ReportExportQueue,
  ) {}

  /** Staff-only export request. Authorization was checked at the controller. */
  async request(factor: RequestFactor): Promise<ReportExportRequestResult> {
    const { actorId, definition, outputFormat } = factor;
    const requestId = typeof factor.requestId === 'string' ? factor.requestId.trim() : '';
    if (!actorId || !requestId || requestId.length > 100) throw reportExportInvalid('A tracked actor/request identity is required.');
    if (!kindPattern.test(definition.kind)) throw reportExportInvalid('Three approved report kinds exist.');
    if (typeof outputFormat !== 'string' || !formatPattern.test(outputFormat)) throw reportExportInvalid('Approved export formats are CSV and Excel.');
    const key = normalizeIdempotencyKey(factor.key);
    if (!key) throw reportExportInvalid('A bounded idempotency key is required.');
    const keyHash = hash(key);
    const definitionHash = definitionHashOf(definition);
    const payloadHash = requestPayloadHash(definition.kind, outputFormat, definitionHash);
    let dispatchedJobId: string | null = null;
    try {
      const outcome = await withSerializableRetry({
        isContention: isPrismaTransactionConflict,
        conflictMessage: 'Export requests changed concurrently; reconcile with the same key.',
        operation: (): Promise<ReportExportRequestResult> => this.prisma.$transaction(async (tx): Promise<ReportExportRequestResult> => {
          const prior = await tx.reportExportCommand.findUnique({
            where: { actorId_reportKind_outputFormat_definitionHash_keyHash: { actorId, reportKind: definition.kind, outputFormat, definitionHash, keyHash } },
            include: { job: { select: { id: true, status: true } } },
          });
          if (prior) {
            if (prior.payloadHash !== payloadHash) {
              throw new ConflictException({ code: 'IDEMPOTENCY_CONFLICT', message: 'Export request replay payload changed.' });
            }
            if (prior.job.status === 'READY') {
              const artifact = await tx.reportExportArtifact.findUnique({
                where: { jobId: prior.job.id },
                select: { contentSha256: true, byteCount: true },
              });
              return { exportId: prior.job.id, status: 'READY', sha256: artifact?.contentSha256 ?? null, byteCount: artifact?.byteCount ?? null, replayed: true };
            }
            if (prior.job.status === 'FAILED') {
              throw notReady('The earlier export attempt failed; repeat the request to retry within capacity.');
            }
            return { exportId: prior.job.id, status: 'PENDING', sha256: null, byteCount: null, replayed: true };
          }
          const locked = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "ReportExportStorageCapacity" WHERE "id" = 'report-export' FOR UPDATE`;
          if (!locked.length) throw unavailable();
          const capacity = await tx.reportExportStorageCapacity.findUnique({ where: { id: 'report-export' } });
          if (!capacity?.isEnabled || capacity.maxPendingJobs < 1) {
            throw new BadRequestException({ code: 'REPORT_EXPORT_DISABLED', message: 'Approved report exports are not enabled.' });
          }
          const active = await tx.reportExportJob.findFirst({
            where: { reportKind: definition.kind, outputFormat, definitionHash, status: { in: ['PENDING', 'RUNNING'] } },
            select: { id: true },
          });
          let jobId: string;
          if (active) {
            jobId = active.id;
          } else {
            // A snapshot only needs one durable artifact per immutable input:
            // an unexpired READY row stays the authoritative answer.
            const completed = await tx.reportExportJob.findFirst({
              where: { reportKind: definition.kind, outputFormat, definitionHash, status: 'READY' },
              orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
              select: { id: true },
            });
            if (completed) {
              const stored = await tx.reportExportArtifact.findUnique({
                where: { jobId: completed.id },
                select: { contentSha256: true, byteCount: true, expiresAt: true },
              });
              if (stored && stored.expiresAt.getTime() > Date.now()) {
                return { exportId: completed.id, status: 'READY', sha256: stored.contentSha256, byteCount: stored.byteCount, replayed: false };
              }
            }
            if (capacity.pendingJobCount >= capacity.maxPendingJobs) {
              throw new ConflictException({ code: 'REPORT_EXPORT_CAPACITY_EXCEEDED', message: 'Approved pending export work capacity is exhausted.' });
            }
            const created = await tx.reportExportJob.create({ data: {
              reportKind: definition.kind,
              outputFormat,
              definitionHash,
              definition: definition as unknown as Prisma.InputJsonValue,
              rendererRevision: 'report-export-1',
              status: 'PENDING',
              requestedByUserId: actorId,
              requestedByScope: 'staff',
              requestKeyHash: keyHash,
              payloadHash } });
            await tx.reportExportStorageCapacity.update({ where: { id: 'report-export' }, data: { pendingJobCount: { increment: 1 }, version: { increment: 1 } } });
            jobId = created.id;
          }
          dispatchedJobId = jobId;
          const command = await tx.reportExportCommand.create({ data: {
            actorId, reportKind: definition.kind, outputFormat, definitionHash, keyHash, payloadHash, jobId, outcome: 'PENDING' } });
          await this.audit.record({
            actorId, action: 'report.export.requested', entityType: 'ReportExportCommand', entityId: command.id, requestId,
            metadata: { reportKind: definition.kind, format: outputFormat, replayed: false } }, tx);
          return { exportId: jobId, status: 'PENDING', sha256: null, byteCount: null, replayed: false };
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }),
      });
      if (dispatchedJobId) {
        await this.queue.enqueue(dispatchedJobId);
      }
      return outcome;
    } catch (error) {
      return this.safeFailure(error);
    }
  }

  /** Polling read for the requesting staff actor. */
  async status(exportId: string): Promise<ReportExportRequestResult> {
    reportExportId(exportId);
    try {
      const job = await this.prisma.reportExportJob.findUnique({ where: { id: exportId } });
      if (!job || !kindPattern.test(job.reportKind)) throw missing();
      const artifact = await this.prisma.reportExportArtifact.findUnique({
        where: { jobId: job.id },
        select: { contentSha256: true, byteCount: true },
      });
      if (artifact) return { exportId: job.id, status: 'READY', sha256: artifact.contentSha256, byteCount: artifact.byteCount, replayed: false };
      if (job.status === 'FAILED') {
        throw notReady('The stored export attempt failed; a new request retries with fresh evidence.');
      }
      if (job.status === 'READY') {
        throw unavailable();
      }
      return { exportId: job.id, status: 'PENDING', sha256: null, byteCount: null, replayed: false };
    } catch (error) {
      return this.safeFailure(error);
    }
  }

  /** Authoritative bounded download for an approved export; never PII columns. */
  private async download(factor: { actorId: string; exportId: string }): Promise<ReportExportDownload> {
    const { exportId } = factor;
    reportExportId(exportId);
    try {
      const job = await this.prisma.reportExportJob.findUnique({
        where: { id: exportId },
        select: { id: true, reportKind: true, outputFormat: true, requestedByUserId: true, status: true, createdAt: true },
      });
      if (!job || job.status !== 'READY') throw notReady('No approved export artifact exists for this request yet.');
      const artifact = await this.prisma.reportExportArtifact.findUnique({
        where: { jobId: job.id },
        select: { contentSha256: true, byteCount: true, bytes: true, expiresAt: true },
      });
      if (!artifact) throw notReady('No approved export artifact exists for this request yet.');
      if (artifact.expiresAt.getTime() <= Date.now()) {
        throw new ConflictException({ code: 'REPORT_EXPORT_ARTIFACT_EXPIRED', message: 'The approved export window has elapsed; request a fresh snapshot.' });
      }
      const bytes = Buffer.from(artifact.bytes);
      const magic = job.outputFormat === 'xlsx' ? Buffer.from('PK') : Buffer.from('');
      const contentType = REPORT_EXPORT_MIME[job.outputFormat];
      if (createHash('sha256').update(bytes).digest('hex') !== artifact.contentSha256
        || bytes.length !== artifact.byteCount
        || bytes.length < 1 || bytes.length > REPORT_EXPORT_ARTIFACT_MAX_BYTES
        || (magic.length > 0 && !bytes.subarray(0, magic.length).equals(magic))) {
        throw unavailable();
      }
      const stamp = job.createdAt.toISOString().slice(0, 10).replaceAll('-', '');
      return {
        bytes,
        contentSha256: artifact.contentSha256,
        byteCount: artifact.byteCount,
        contentType,
        filename: `iranyaragh-${KIND_SLUG[job.reportKind] ?? 'report'}-${stamp}.${EXTENSION[job.outputFormat] ?? 'txt'}`,
      };
    } catch (error) {
      return this.safeFailure(error);
    }
  }

  async downloadStaff(exportId: string): Promise<ReportExportDownload> {
    return this.download({ actorId: '', exportId });
  }

  /** Lease claim used by the dedicated render worker. */
  async claim(workerId: string): Promise<ReportExportClaimedJob | null> {
    if (typeof workerId !== 'string' || !workerPattern.test(workerId)) throw reportExportInvalid('A durable export worker lease identity is required.');
    try {
      return await withSerializableRetry({
        isContention: isPrismaTransactionConflict,
        conflictMessage: 'Export lease contention; retry the claim.',
        operation: () => this.prisma.$transaction(async (tx) => {
          const capacity = await tx.reportExportStorageCapacity.findUnique({ where: { id: 'report-export' } });
          if (!capacity?.isEnabled) return null;
          const now = new Date();
          const leaseExpireAt = new Date(now.getTime() + REPORT_EXPORT_LEASE_SECONDS * 1000);
          const candidate = await tx.$queryRaw<Array<{ id: string }>>`
            SELECT "id" FROM "ReportExportJob"
            WHERE ("status" = 'PENDING' AND "attempts" < ${REPORT_EXPORT_MAX_ATTEMPTS})
               OR ("status" = 'RUNNING' AND "leaseExpireAt" < ${now} AND "attempts" < ${REPORT_EXPORT_MAX_ATTEMPTS})
            ORDER BY "createdAt" ASC, "id" ASC
            LIMIT 1 FOR UPDATE SKIP LOCKED`;
          const id = candidate[0]?.id;
          if (!id) return null;
          const claimed = await tx.$queryRaw<Array<{
            id: string; leaseVersion: number; attempts: number;
            reportKind: string; outputFormat: string;
            definitionHash: string; rendererRevision: string;
            requestKeyHash: string; definition: Prisma.JsonValue;
          }>>`
            UPDATE "ReportExportJob" SET
              "status" = 'RUNNING', "leaseVersion" = "leaseVersion" + 1,
              "leaseOwner" = ${workerId}, "leaseIssuedAt" = ${now}, "leaseExpireAt" = ${leaseExpireAt},
              "attempts" = "attempts" + 1, "updatedAt" = ${now}
            WHERE "id" = ${id}
            RETURNING "id", "leaseVersion", "attempts", "reportKind", "outputFormat",
              "definitionHash", "rendererRevision", "requestKeyHash", "definition"`;
          const row = claimed[0];
          if (!row || !row.definition || typeof row.definition !== 'object') return null;
          return {
            jobId: row.id,
            leaseVersion: row.leaseVersion,
            attempts: row.attempts,
            reportKind: row.reportKind,
            outputFormat: row.outputFormat,
            definitionHash: row.definitionHash,
            rendererRevision: row.rendererRevision,
            requestKeyHash: row.requestKeyHash,
            definition: row.definition as unknown as ReportExportDefinition,
          };
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }),
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      return null;
    }
  }

  /** Ready completion from the worker: store bytes under the lease, then close the job. */
  async completeRender(
    identity: ReportExportClaimedJob,
    bytes: Buffer,
    requestId: string,
  ): Promise<'READY' | 'STALE' | 'STORE_FAILED'> {
    try {
      const stored = await this.store.persist({
        jobId: identity.jobId,
        jobRequestKeyHash: identity.requestKeyHash,
        reportKind: identity.reportKind,
        outputFormat: identity.outputFormat,
        definitionHash: identity.definitionHash,
        bytes,
      }, requestId);
      const settled = await withSerializableRetry({
        isContention: isPrismaTransactionConflict,
        conflictMessage: 'Export completion contention; reconcile.',
        operation: () => this.prisma.$transaction(async (tx) => {
          const job = await tx.reportExportJob.findUnique({
            where: { id: identity.jobId },
            select: { id: true, leaseVersion: true, status: true, requestKeyHash: true, attempts: true, reportKind: true },
          });
          if (!job || job.leaseVersion !== identity.leaseVersion || job.status !== 'RUNNING') return false;
          await tx.reportExportJob.update({
            where: { id: job.id },
            data: { status: 'READY', leaseOwner: null, leaseIssuedAt: null, leaseExpireAt: null, failureReason: null } });
          await tx.reportExportStorageCapacity.update({ where: { id: 'report-export' }, data: { pendingJobCount: { decrement: 1 }, version: { increment: 1 } } });
          await this.audit.record({
            action: 'report.export.render.completed', entityType: 'ReportExportJob', entityId: job.id, requestId,
            metadata: { reportKind: job.reportKind, attempts: job.attempts, artifactId: stored.artifact.id } }, tx);
          return true;
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }),
      });
      return settled ? 'READY' : 'STALE';
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw unavailable();
    }
  }

  /** Worker-side bounded failure record; safe codes only, never raw error text. */
  async attemptFailed(jobId: string, leaseVersion: number, finalAttempt: boolean, reason: ReportExportFailureCode, requestId: string): Promise<void> {
    if (!REPORT_EXPORT_FAILURE_CODES.includes(reason)) throw reportExportInvalid('A bounded failure reason is required.');
    try {
      await withSerializableRetry({
        isContention: isPrismaTransactionConflict,
        conflictMessage: 'Failure recording contention; reconcile.',
        operation: () => this.prisma.$transaction(async (tx) => {
          const job = await tx.reportExportJob.findUnique({ where: { id: jobId }, select: { id: true, leaseVersion: true, attempts: true, status: true } });
          if (!job || job.leaseVersion !== leaseVersion || job.status !== 'RUNNING') return null;
          if (finalAttempt) {
            await tx.reportExportJob.update({ where: { id: job.id }, data: { status: 'FAILED', failureReason: reason, leaseOwner: null, leaseIssuedAt: null, leaseExpireAt: null } });
            await tx.reportExportStorageCapacity.update({ where: { id: 'report-export' }, data: { pendingJobCount: { decrement: 1 }, version: { increment: 1 } } });
          } else {
            await tx.reportExportJob.update({ where: { id: job.id }, data: { status: 'PENDING', leaseOwner: null, leaseIssuedAt: null, leaseExpireAt: null } });
          }
          await this.audit.record({
            action: 'report.export.render.failed', entityType: 'ReportExportJob', entityId: jobId, requestId,
            metadata: { attempt: job.attempts, final: finalAttempt, reason } }, tx);
          return job.id;
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }),
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      new RedactedLogger().event('error', { event: 'report.export.failure.record.failed', outcome: 'unknown', errorCode: 'REPORT_EXPORT_STORAGE_UNAVAILABLE' });
      throw unavailable();
    }
  }

  private safeFailure(error: unknown): never {
    if (error instanceof HttpException) throw error;
    new RedactedLogger().event('error', { event: 'report.export.job.failed', outcome: 'unknown', errorCode: 'REPORT_EXPORT_STORAGE_UNAVAILABLE' });
    throw new InternalServerErrorException({ code: 'REPORT_EXPORT_STORAGE_UNAVAILABLE', message: 'Report export outcome could not be confirmed; reconcile before retrying.' });
  }
}
