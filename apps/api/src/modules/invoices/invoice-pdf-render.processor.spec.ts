import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../database/prisma.service';
import { INVOICE_PDF_MAX_ATTEMPTS, type InvoicePdfClaimedJob, type InvoicePdfJobService } from './invoice-pdf-job.service';
import { InvoicePdfRenderProcessor } from './invoice-pdf-render.processor';

vi.mock('playwright', () => ({ chromium: { launch: vi.fn(async () => { throw new Error('no browser in unit tests'); }) } }));

const claimed = (attempts: number): InvoicePdfClaimedJob => ({
  jobId: 'job-1', leaseVersion: 2, attempts, documentId: 'doc-1', documentPayloadHash: 'a'.repeat(64),
  renderInputHash: 'b'.repeat(64), rendererRevision: 'r', templateRevision: 't', fontSha256: 'c'.repeat(64),
} as InvoicePdfClaimedJob);

function processorFor(attempts: number | null) {
  const jobs = { claim: vi.fn(async () => (attempts === null ? null : claimed(attempts))), completeRender: vi.fn(), attemptFailed: vi.fn(async () => undefined) };
  // A missing document fails the render before any browser is launched.
  const prisma = { invoiceDocument: { findUnique: vi.fn(async () => null) } };
  const processor = new InvoicePdfRenderProcessor(jobs as unknown as InvoicePdfJobService, prisma as unknown as PrismaService, { workerId: 'worker-1', renderTimeoutMs: 5000, assetsDir: '/nonexistent' });
  return { processor, jobs };
}

describe('invoice PDF render attempt finality', () => {
  it('keeps an early recovery attempt retryable', async () => {
    const { processor, jobs } = processorFor(1);
    await processor.process('database-recovery', { finalAttempt: false });
    expect(jobs.attemptFailed).toHaveBeenCalledWith('job-1', 2, false, 'RENDER_FAILED', expect.any(String));
    expect(jobs.completeRender).not.toHaveBeenCalled();
  });

  it('settles the last budgeted attempt even when the delivery is a recovery wake-up', async () => {
    const { processor, jobs } = processorFor(INVOICE_PDF_MAX_ATTEMPTS);
    await processor.process('database-recovery', { finalAttempt: false });
    expect(jobs.attemptFailed).toHaveBeenCalledWith('job-1', 2, true, 'RENDER_FAILED', expect.any(String));
  });

  it('honours a final queue delivery and does nothing when no job is claimable', async () => {
    const final = processorFor(1);
    await final.processor.process('job-1', { finalAttempt: true });
    expect(final.jobs.attemptFailed).toHaveBeenCalledWith('job-1', 2, true, 'RENDER_FAILED', expect.any(String));
    const idle = processorFor(null);
    await idle.processor.process('database-recovery', { finalAttempt: false });
    expect(idle.jobs.attemptFailed).not.toHaveBeenCalled();
  });
});
