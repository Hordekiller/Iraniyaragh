import { HttpException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { chromium } from 'playwright';
import { RedactedLogger } from '../../common/redacted-logger';
import type { PrismaService } from '../../database/prisma.service';
import { customerInvoice } from './invoice-publication.service';
import { buildInvoicePdfHtml, InvoicePdfInputError } from './invoice-pdf-template';
import { InvoicePdfAssetsProvider } from './invoice-pdf-assets';
import type { InvoicePdfClaimedJob, InvoicePdfFailureCode } from './invoice-pdf-job.service';
import { InvoicePdfJobService } from './invoice-pdf-job.service';

export type InvoicePdfRuntimeOptions = {
  /** Bounded lease identity validated by the job service claim pattern. */
  workerId: string;
  /** Shared per-process render bound in milliseconds (5-60s). */
  renderTimeoutMs: number;
  /** Absolute assets directory the runtime supplies post-environment validation. */
  assetsDir?: string;
};

/** Runs on the dedicated pdf-render-worker image only; never inside the API image.
 * Chromium keeps the sandbox enabled; the compose runtime enforces the dedicated
 * unprivileged execution (own image, seccomp profile, bounded resources).
 */
export class InvoicePdfRenderProcessor {
  private readonly workerId: string;
  private readonly renderTimeoutMs: number;
  private readonly assets: InvoicePdfAssetsProvider;
  private logger = new RedactedLogger();

  constructor(
    private readonly jobs: InvoicePdfJobService,
    private readonly prisma: PrismaService,
    options: InvoicePdfRuntimeOptions,
  ) {
    this.workerId = options.workerId;
    this.renderTimeoutMs = options.renderTimeoutMs;
    this.assets = new InvoicePdfAssetsProvider(options.assetsDir);
  }

  /** Queue delivery is a wake-up signal; the database lease stays authoritative.
   * One attempt per claim; the browser, lease and evidence never outlive it.
   */
  async process(jobId: string, options: { finalAttempt: boolean }): Promise<void> {
    const identity = await this.jobs.claim(this.workerId);
    if (!identity) return;
    const requestId = `render-${randomUUID()}`;
    try {
      const bytes = await this.render(identity);
      await this.jobs.completeRender(identity, bytes, requestId);
    } catch (error) {
      await this.recordFailure(identity, options.finalAttempt, resolveFailureCode(error), requestId);
    }
  }

  private async render(identity: InvoicePdfClaimedJob): Promise<Buffer> {
    const document = await this.prisma.invoiceDocument.findUnique({
      where: { id: identity.documentId },
      select: { snapshot: true, payloadHash: true },
    });
    if (!document || document.payloadHash !== identity.documentPayloadHash) {
      throw new InvoicePdfInputError();
    }
    const projection = customerInvoice(document.snapshot as never);
    const { html } = buildInvoicePdfHtml(projection, this.assets.load(), identity.templateRevision);
    // No file:// or network navigation: trusted stored bytes only.
    return renderPdfWithChromium(html, this.renderTimeoutMs);
  }

  private async recordFailure(
    identity: InvoicePdfClaimedJob,
    finalAttempt: boolean,
    reason: InvoicePdfFailureCode,
    requestId: string,
  ): Promise<void> {
    try {
      await this.jobs.attemptFailed(identity.jobId, identity.leaseVersion, finalAttempt, reason, requestId);
    } catch {
      // The lease expires and a queued replay re-claims; queue failure reason
      // stays bounded so raw browser or SQL text never leaks into evidence.
      this.logger.event('error', {
        event: 'invoice.pdf.render.failure.record.failed',
        outcome: 'unknown',
        errorCode: 'INVOICE_PDF_STORAGE_UNAVAILABLE',
      });
      throw new Error('Invoice PDF failure recording failed; inspect database evidence.');
    }
  }
}

function resolveFailureCode(error: unknown): InvoicePdfFailureCode {
  if (error instanceof InvoicePdfInputError) return 'RENDER_FAILED';
  if (/timeout|timed out/iu.test(error instanceof Error ? error.message : String(error))) return 'RENDER_TIMEOUT';
  if (error instanceof HttpException) return 'STORE_REJECTED';
  return 'RENDER_UNAVAILABLE';
}

async function renderPdfWithChromium(html: string, renderTimeoutMs: number): Promise<Buffer> {
  let browser;
  try {
    // Sandbox stays enabled; launch failure reports a bounded infrastructure error.
    browser = await chromium.launch({ headless: true, timeout: renderTimeoutMs });
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      await page.setContent(html, { waitUntil: 'load', timeout: renderTimeoutMs });
      // Chromium's own per-call timeouts are not typed on this surface; a
      // bounded race keeps a hung pdf generation inside the lease window.
      return await withTimeout(page.pdf({ preferCSSPageSize: true, printBackground: true }), renderTimeoutMs);
    } finally {
      await context.close();
    }
  } finally {
    await browser?.close();
  }
}

function withTimeout(promise: Promise<Buffer>, timeoutMs: number): Promise<Buffer> {
  return Promise.race([
    promise,
    new Promise<Buffer>((_, reject) => {
      setTimeout(() => reject(new Error('pdf generation timed out')), timeoutMs);
    }),
  ]);
}
