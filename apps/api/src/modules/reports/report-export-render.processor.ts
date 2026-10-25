import { HttpException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { RedactedLogger } from '../../common/redacted-logger';
import type { PrismaService } from '../../database/prisma.service';
import { ReportExportRenderer, type ReportExportRender } from './report-export.renderer';
import { serializeExport } from './report-export.format';
import { ReportExportArtifactStore } from './report-export-artifact.store';
import type { ReportExportClaimedJob } from './report-export-job.service';
import { ReportExportJobService, REPORT_EXPORT_MAX_ATTEMPTS } from './report-export-job.service';
import { REPORT_EXPORT_RENDERER_REVISION, type ReportExportFailureCode } from './report-export-artifact.store';

export type ReportExportRuntimeOptions = {
  workerId: string;
  /** Per-render lease budget in milliseconds (bounded). */
  renderTimeoutMs: number;
  cleanupIntervalMs: number;
};

/** Runs on the shared worker image only; never inside the API image.
 * The renderer keeps the statement budget inherited from the report module
 * (RepeatableRead snapshot, statement timeout) and the store keeps byte bounds.
 */
export class ReportExportRenderProcessor {
  private readonly workerId: string;
  private readonly renderTimeoutMs: number;
  private readonly cleanupIntervalMs: number;
  private logger = new RedactedLogger();
  private cleanupTimer?: NodeJS.Timeout;
  private cleanupInFlight = false;

  constructor(
    private readonly jobs: ReportExportJobService,
    private readonly renderer: ReportExportRenderer,
    private readonly prisma: PrismaService,
    private readonly store: ReportExportArtifactStore,
    options: ReportExportRuntimeOptions,
  ) {
    this.workerId = options.workerId;
    this.renderTimeoutMs = options.renderTimeoutMs;
    this.cleanupIntervalMs = options.cleanupIntervalMs;
  }

  start(): void {
    this.cleanupTimer = setInterval(() => {
      void this.runCleanup();
    }, this.cleanupIntervalMs);
    this.cleanupTimer.unref?.();
  }

  async stop(): Promise<void> {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
  }

  private async runCleanup(): Promise<void> {
    if (this.cleanupInFlight) return;
    this.cleanupInFlight = true;
    try {
      const requestId = `cleanup-${randomUUID()}`;
      await this.store.cleanupExpired(new Date(), requestId);
    } catch {
      this.logger.event('error', {
        event: 'report.export.cleanup.unavailable',
        outcome: 'unknown',
        errorCode: 'REPORT_EXPORT_STORAGE_UNAVAILABLE',
      });
    } finally {
      this.cleanupInFlight = false;
    }
  }

  /** Queue delivery is a wake-up signal; the database lease stays authoritative. */
  async process(_jobId: string, options: { finalAttempt: boolean }): Promise<void> {
    const identity = await this.jobs.claim(this.workerId);
    if (!identity) return;
    const requestId = `render-${randomUUID()}`;
    try {
      if (identity.rendererRevision !== REPORT_EXPORT_RENDERER_REVISION) {
        throw new Error('export renderer revision mismatch');
      }
      if (identity.attempts > REPORT_EXPORT_MAX_ATTEMPTS) {
        throw new Error('export attempt budget exhausted');
      }
      const bytes = await withTimeout(
        this.render(identity),
        this.renderTimeoutMs,
      );
      await this.jobs.completeRender(identity, bytes, requestId);
    } catch (error) {
      await this.recordFailure(identity, options.finalAttempt, resolveFailureCode(error), requestId);
    }
  }

  private async render(identity: ReportExportClaimedJob): Promise<Buffer> {
    const table: ReportExportRender = await this.renderer.render(identity.definition);
    if (!table || !Array.isArray(table.headers) || !Array.isArray(table.rows)
      || table.headers.length < 1 || table.headers.length > 64) {
      throw new Error('export table rejected');
    }
    return serializeExport(
      identity.outputFormat === 'xlsx' ? 'xlsx' : 'csv',
      table,
    );
  }

  private async recordFailure(
    identity: ReportExportClaimedJob,
    finalAttempt: boolean,
    reason: ReportExportFailureCode,
    requestId: string,
  ): Promise<void> {
    try {
      await this.jobs.attemptFailed(identity.jobId, identity.leaseVersion, finalAttempt, reason, requestId);
    } catch {
      this.logger.event('error', {
        event: 'report.export.render.failure.record.failed',
        outcome: 'unknown',
        errorCode: 'REPORT_EXPORT_STORAGE_UNAVAILABLE',
      });
      throw new Error('Report export failure recording failed; inspect database evidence.');
    }
  }
}

function resolveFailureCode(error: unknown): ReportExportFailureCode {
  if (/timeout|timed out/iu.test(error instanceof Error ? error.message : String(error))) return 'RENDER_TIMEOUT';
  if (error instanceof HttpException) return 'STORE_REJECTED';
  if (error instanceof Error && /revision mismatch|attempt budget/.test(error.message)) return 'RENDER_FAILED';
  return 'RENDER_UNAVAILABLE';
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error('export generation timed out')), timeoutMs);
    }),
  ]);
}
