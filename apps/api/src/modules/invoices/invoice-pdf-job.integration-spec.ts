import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../database/prisma.service';
import { assertIsolatedTestDatabase } from '../../test/database-url.guard';
import { AuditLogService } from '../audit/audit-log.service';
import { StaffOrderService } from '../orders/staff-order.service';
import { ConfiguredShippingQuoteAdapter } from '../orders/configured-shipping-quote.adapter';
import { EMPTY_AXIS_SIGNATURE, canonicalizeSku } from '../catalog/variant-identifiers';
import { InvoicePolicyService } from './invoice-policy.service';
import { InvoiceDraftService } from './invoice-draft.service';
import { InvoiceDocumentService } from './invoice-document.service';
import { InvoicePublicationService } from './invoice-publication.service';
import { InvoicePdfArtifactStore } from './invoice-pdf-artifact.store';
import { InvoicePdfJobService, INVOICE_PDF_MAX_ATTEMPTS, INVOICE_PDF_RENDERER_REVISION } from './invoice-pdf-job.service';
import type { InvoicePdfQueue } from './invoice-pdf-queue.port';
import {
  INVOICE_PDF_ASSETS,
  INVOICE_PDF_LIMITS,
  INVOICE_PDF_TEMPLATE_REVISION,
} from './invoice-pdf-template';

describe.sequential('Private invoice PDF render jobs PostgreSQL acceptance', () => {
  const prisma = new PrismaService();
  const audit = new AuditLogService(prisma);
  const orders = new StaffOrderService(prisma, audit);
  const policies = new InvoicePolicyService(prisma, audit);
  const shipping = new ConfiguredShippingQuoteAdapter(prisma);
  const drafts = new InvoiceDraftService(prisma, audit, orders, shipping);
  const documents = new InvoiceDocumentService(prisma, audit, drafts, policies);
  const access = new InvoicePublicationService(prisma, audit);
  const store = new InvoicePdfArtifactStore(prisma, audit);
  // Wake-up deliveries are recorded; the worker path itself is exercised in e2e.
  const queued: string[] = [];
  const queue: InvoicePdfQueue = {
    enqueue: async (jobId: string) => { queued.push(jobId); },
  };
  const jobs = new InvoicePdfJobService(prisma, audit, store, queue);
  const run = randomUUID().replaceAll('-', '');
  const requestId = `invoice-pdf-${run}`;
  let actorId = '';
  let customerUserId = '';
  let foreignUserId = '';
  let customerId = '';
  let variantId = '';
  let productId = '';
  let warehouseId = '';
  let locationId = '';
  let connected = false;
  let sequence = 0;
  const key = () => `pdf-${run}-${sequence++}`;
  const address = { provinceCode: 'THR', city: 'Isolated city', address: 'Isolated invoice address', postalCode: '1234567890', recipient: 'Isolated recipient', mobile: '+989120000000' };
  const code = (name: string) => expect.objectContaining({ response: expect.objectContaining({ code: name }) });
  const staffRequest = (documentId: string, keyId: string, requestIdSuffix = keyId) =>
    jobs.request({ scope: 'staff', actorId, requestId: `${requestId}-${requestIdSuffix}`, documentId, key: keyId });

  async function clearInvoices() {
    assertIsolatedTestDatabase({ databaseUrl: process.env.DATABASE_URL, nodeEnvironment: process.env.NODE_ENV });
    await prisma.$executeRawUnsafe('TRUNCATE "InvoicePdfRenderJobCommand", "InvoicePdfRenderJob", "InvoicePdfArtifact", "InvoicePdfStorageCapacity", "InvoicePublicationCommand", "InvoicePublicationEvent", "InvoicePublication", "InvoiceIssueCommand", "InvoiceDocumentEvent", "InvoiceDocumentLine", "InvoiceDocument", "InvoiceSeriesCounter", "InvoiceDraftCommand", "InvoiceDraftRevision", "InvoiceDraftLine", "InvoiceDraft", "InvoicePolicyCommand", "InvoicePolicyRevision"');
  }

  async function enablePdf(option: { enabled?: boolean; maxPendingJobs?: number } = {}) {
    await prisma.invoicePdfStorageCapacity.upsert({
      where: { id: 'invoice-pdf' },
      create: {
        id: 'invoice-pdf', budgetBytes: 8n * 1024n * 1024n, maxArtifacts: 8,
        maxPendingJobs: option.maxPendingJobs ?? 2, isEnabled: option.enabled !== false,
        storedBytes: 0n, artifactCount: 0, pendingJobCount: 0, version: 1,
      },
      update: {
        isEnabled: option.enabled !== false, maxPendingJobs: option.maxPendingJobs ?? 2,
        maxArtifacts: 8, budgetBytes: 8n * 1024n * 1024n, version: { increment: 1 },
      },
    });
  }

  async function policy() {
    const previous = await policies.current();
    return policies.update(actorId, requestId, { expectedVersion: previous?.version ?? null, sellerName: 'Isolated seller', sellerAddress: 'Isolated seller address', sellerContact: 'Public test contact', taxTreatment: 'INCLUSIVE', taxRateBps: 0, exemptionReason: null, discountCapBps: 10000, shippingTaxable: false, isActive: true, reason: 'Isolated accepted test policy' }, key());
  }

  async function issueDocument(): Promise<{ documentId: string; number: string }> {
    const created = await orders.create({ actorId, requestId: `${requestId}-${sequence++}`, idempotencyKey: key(), payload: { customerId, lines: [{ variantId, quantity: 1 }], address } });
    const order = created.data.order;
    const draft = (await drafts.fromOrder(actorId, requestId, order.id, { expectedOrderVersion: order.version, note: null }, key())).draft;
    const issued = await documents.issue(actorId, requestId, draft.id, { expectedVersion: draft.version, expectedOrderVersion: order.version }, key());
    return { documentId: issued.document.id, number: issued.document.number };
  }

  const pdfBytes = (marker: string) => Buffer.concat([Buffer.from('%PDF-'), Buffer.from(`${marker}; no customer data beyond synthetic profile`, 'utf8')]);

  async function reset(): Promise<void> {
    await clearInvoices();
    await policy();
  }

  beforeAll(async () => {
    assertIsolatedTestDatabase({ databaseUrl: process.env.DATABASE_URL, nodeEnvironment: process.env.NODE_ENV });
    await prisma.$connect();
    connected = true;
    await clearInvoices();
    actorId = (await prisma.user.create({ data: { email: `${run}@example.test`, status: 'ACTIVE' } })).id;
    customerUserId = (await prisma.user.create({ data: { email: `pdf-buyer-${run}@example.test`, status: 'ACTIVE' } })).id;
    foreignUserId = (await prisma.user.create({ data: { email: `pdf-foreign-${run}@example.test`, status: 'ACTIVE' } })).id;
    customerId = (await prisma.customer.create({ data: { userId: customerUserId, mobile: `+9891${(BigInt(`0x${run}`) % 100000000n).toString().padStart(8, '0')}`, firstName: 'Pdf', lastName: 'Buyer' } })).id;
    productId = (await prisma.product.create({ data: { name: 'Isolated pdf product', slug: `invoice-pdf-${run}`, status: 'ACTIVE' } })).id;
    const sku = `PDF-${run}`;
    variantId = (await prisma.productVariant.create({ data: { productId, sku, skuKey: canonicalizeSku(sku), combinationSignature: EMPTY_AXIS_SIGNATURE, salePrice: 1000n, costPrice: 500n, status: 'ACTIVE', isActive: true } })).id;
    warehouseId = (await prisma.warehouse.create({ data: { code: `PDF-${run}`, name: 'Isolated pdf warehouse' } })).id;
    locationId = (await prisma.warehouseLocation.create({ data: { warehouseId, code: 'PDF', name: 'Isolated pdf location' } })).id;
    await prisma.inventoryBalance.create({ data: { warehouseId, locationId, variantId, onHand: 200, reserved: 0, available: 200 } });
    await policy();
  });

  afterAll(async () => {
    if (!connected) return;
    await clearInvoices();
    const ids = (await prisma.order.findMany({ where: { customerId }, select: { id: true } })).map(row => row.id);
    await prisma.stockReservation.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.orderTransition.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.staffOrderCommandRecord.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.outboxEvent.deleteMany({ where: { aggregateId: { in: ids } } });
    await prisma.orderItem.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.order.deleteMany({ where: { id: { in: ids } } });
    await prisma.inventoryBalance.deleteMany({ where: { variantId } });
    await prisma.productVariant.delete({ where: { id: variantId } });
    await prisma.product.delete({ where: { id: productId } });
    await prisma.warehouseLocation.delete({ where: { id: locationId } });
    await prisma.warehouse.delete({ where: { id: warehouseId } });
    await prisma.customer.delete({ where: { id: customerId } });
    await prisma.customerCommandRecord.deleteMany({ where: { actorId } });
    await prisma.auditLog.deleteMany({ where: { actorId } });
    await prisma.user.deleteMany({ where: { id: { in: [actorId, customerUserId, foreignUserId] } } });
    await prisma.$disconnect();
  });

  it('refuses requests while capacity is disabled and never fabricates artifacts', async () => {
    await reset();
    await enablePdf({ enabled: false });
    const issued = await issueDocument();
    await expect(staffRequest(issued.documentId, key())).rejects.toMatchObject(code('INVOICE_PDF_DISABLED'));
    await expect(jobs.downloadStaff(issued.documentId)).rejects.toMatchObject(code('INVOICE_PDF_NOT_READY'));
    expect(await prisma.invoicePdfRenderJob.count()).toBe(0);
    expect(queued).toHaveLength(0);
  });

  it('creates one durable job, dispatches wake-ups, replays and converges on a downloadable artifact', async () => {
    await reset();
    queued.length = 0;
    await enablePdf();
    const issued = await issueDocument();
    const firstKey = key();
    // Unknown documents never create evidence.
    await expect(staffRequest(randomUUID(), key())).rejects.toMatchObject(code('INVOICE_DOCUMENT_NOT_FOUND'));
    const first = await staffRequest(issued.documentId, firstKey);
    expect(first).toMatchObject({ documentId: issued.documentId, status: 'PENDING', sha256: null, byteCount: null, replayed: false });
    expect(queued).toHaveLength(1);
    const jobId = queued[0]!;
    expect(await prisma.invoicePdfRenderJob.findUnique({ where: { id: jobId } })).toMatchObject({
      documentId: issued.documentId, status: 'PENDING', attempts: 0, leaseOwner: null,
      rendererRevision: INVOICE_PDF_RENDERER_REVISION, templateRevision: INVOICE_PDF_TEMPLATE_REVISION,
      fontSha256: INVOICE_PDF_ASSETS.fontSha256,
    });
    expect(await prisma.invoicePdfStorageCapacity.findUnique({ where: { id: 'invoice-pdf' } })).toMatchObject({ pendingJobCount: 1 });
    // Same key replays without another dispatch; a distinct key joins the
    // active job and wakes the worker once.
    expect(await staffRequest(issued.documentId, firstKey)).toMatchObject({ status: 'PENDING', replayed: true });
    expect(queued).toHaveLength(1);
    const joinedKey = key();
    expect(await staffRequest(issued.documentId, joinedKey)).toMatchObject({ status: 'PENDING', replayed: false });
    expect(queued).toHaveLength(2);
    expect(await prisma.invoicePdfRenderJobCommand.count({ where: { jobId, outcome: 'PENDING' } })).toBe(2);
    // Claim grants a lease; a concurrent claim finds nothing while it is held.
    const identity = await jobs.claim('pdf-spec-worker');
    expect(identity).toMatchObject({ jobId, documentId: issued.documentId, attempts: 1, leaseVersion: 1 });
    expect(await prisma.invoicePdfRenderJob.findUnique({ where: { id: jobId } })).toMatchObject({ status: 'RUNNING', attempts: 1, leaseOwner: 'pdf-spec-worker' });
    expect(await jobs.claim('pdf-spec-worker')).toBeNull();
    const bytes = pdfBytes('acceptance-one');
    expect(await jobs.completeRender(identity!, bytes, `${requestId}-complete`)).toBe('READY');
    expect(await prisma.invoicePdfStorageCapacity.findUnique({ where: { id: 'invoice-pdf' } })).toMatchObject({ pendingJobCount: 0 });
    // Commands stay append-only evidence; the READY state lives on the job row.
    expect(await prisma.invoicePdfRenderJobCommand.count({ where: { jobId, outcome: 'PENDING' } })).toBe(2);
    const ready = await staffRequest(issued.documentId, joinedKey);
    expect(ready.status).toBe('READY');
    expect(ready.sha256).toBeTypeOf('string');
    expect(ready.byteCount).toBe(bytes.length);
    const downloaded = await jobs.downloadStaff(issued.documentId);
    expect(downloaded.bytes.equals(bytes)).toBe(true);
    expect(downloaded.pdfSha256).toBe(ready.sha256);
    expect(downloaded.filename).toBe(`iranyaragh-invoice-${issued.number}.pdf`);
    const artifactRow = await prisma.invoicePdfArtifact.findUnique({ where: {
      documentId_renderInputHash_rendererRevision_templateRevision_fontSha256: {
        documentId: issued.documentId,
        renderInputHash: identity!.renderInputHash,
        rendererRevision: INVOICE_PDF_RENDERER_REVISION,
        templateRevision: INVOICE_PDF_TEMPLATE_REVISION,
        fontSha256: INVOICE_PDF_ASSETS.fontSha256,
      } } });
    expect(artifactRow?.pdfSha256).toBe(ready.sha256);
    expect(artifactRow?.byteCount).toBe(bytes.length);
    expect(await prisma.auditLog.count({ where: { action: 'invoice.pdf.stored', entityId: artifactRow!.id } })).toBe(1);
  });

  it('publishes for the owner only and keeps the artifact out of reach before publication', async () => {
    await reset();
    queued.length = 0;
    await enablePdf();
    const issued = await issueDocument();
    await jobs.request({ scope: 'staff', actorId, requestId: `${requestId}-pub`, documentId: issued.documentId, key: key() });
    const identity = await jobs.claim('pdf-spec-worker');
    const bytes = pdfBytes('acceptance-pub');
    await jobs.completeRender(identity!, bytes, `${requestId}-pub-complete`);
    expect(await prisma.invoicePdfStorageCapacity.findUnique({ where: { id: 'invoice-pdf' } })).toMatchObject({ pendingJobCount: 0 });
    await expect(jobs.downloadCustomer(customerUserId, issued.documentId)).rejects.toMatchObject(code('INVOICE_DOCUMENT_NOT_FOUND'));
    await expect(jobs.downloadCustomer(foreignUserId, issued.documentId)).rejects.toMatchObject(code('INVOICE_DOCUMENT_NOT_FOUND'));
    await access.change(actorId, `${requestId}-pub-publish`, issued.documentId, { isPublished: true, expectedVersion: 0, reason: 'Publish for the pdf acceptance path' }, key());
    await expect(jobs.downloadCustomer(foreignUserId, issued.documentId)).rejects.toMatchObject(code('INVOICE_DOCUMENT_NOT_FOUND'));
    const downloaded = await jobs.downloadCustomer(customerUserId, issued.documentId);
    expect(downloaded.bytes.subarray(0, 5).toString()).toBe('%PDF-');
    expect(downloaded.bytes.equals(bytes)).toBe(true);
  });

  it('keeps a failed attempt pending and honors bounded retries until ready', async () => {
    await reset();
    queued.length = 0;
    await enablePdf();
    const issued = await issueDocument();
    await staffRequest(issued.documentId, key());
    let identity = await jobs.claim('pdf-spec-worker');
    expect(identity).not.toBeNull();
    await jobs.attemptFailed(identity!.jobId, identity!.leaseVersion, false, 'RENDER_UNAVAILABLE', `${requestId}-retry-a`);
    expect(await prisma.invoicePdfRenderJob.findUnique({ where: { id: identity!.jobId } })).toMatchObject({
      status: 'PENDING', leaseOwner: null, attempts: 1, failureReason: null,
    });
    identity = await jobs.claim('pdf-spec-worker');
    expect(identity).toMatchObject({ attempts: 2, leaseVersion: 2 });
    const bytes = pdfBytes('acceptance-retry');
    expect(await jobs.completeRender(identity!, bytes, `${requestId}-retry-complete`)).toBe('READY');
    expect(await prisma.invoicePdfRenderJob.findUnique({ where: { id: identity!.jobId } })).toMatchObject({ status: 'READY', attempts: 2, failureReason: null });
    expect(await prisma.invoicePdfStorageCapacity.findUnique({ where: { id: 'invoice-pdf' } })).toMatchObject({ pendingJobCount: 0 });
  });

  it('stale completions report honestly and the reclaimed owner finishes the job', async () => {
    await reset();
    queued.length = 0;
    await enablePdf();
    const issued = await issueDocument();
    await staffRequest(issued.documentId, key());
    const staleIdentity = await jobs.claim('pdf-stale-worker');
    // A reclaim owner takes over via the bounded retry path; the stale owner
    // then finishes rendering and must not claim success.
    await jobs.attemptFailed(staleIdentity!.jobId, staleIdentity!.leaseVersion, false, 'RENDER_UNAVAILABLE', `${requestId}-stale-failure`);
    const freshIdentity = await jobs.claim('pdf-fresh-worker');
    expect(freshIdentity).toMatchObject({ jobId: staleIdentity!.jobId, leaseVersion: staleIdentity!.leaseVersion + 1 });
    const bytes = pdfBytes('acceptance-stale');
    expect(await jobs.completeRender(staleIdentity!, bytes, `${requestId}-stale-complete`)).toBe('STALE');
    expect(await prisma.invoicePdfRenderJob.findUnique({ where: { id: staleIdentity!.jobId } })).toMatchObject({ status: 'RUNNING' });
    expect(await jobs.completeRender(freshIdentity!, bytes, `${requestId}-fresh-complete`)).toBe('READY');
    expect(await prisma.invoicePdfRenderJob.findUnique({ where: { id: staleIdentity!.jobId } })).toMatchObject({ status: 'READY', leaseOwner: null });
    expect(await prisma.invoicePdfStorageCapacity.findUnique({ where: { id: 'invoice-pdf' } })).toMatchObject({ pendingJobCount: 0 });
  });

  it('fails honestly after the final attempt and frees the pending slot', async () => {
    await reset();
    queued.length = 0;
    await enablePdf();
    const issued = await issueDocument();
    const failedKey = key();
    await staffRequest(issued.documentId, failedKey);
    let identity = await jobs.claim('pdf-spec-worker');
    expect(identity).not.toBeNull();
    // Drain attempts through the real claim/failure path; no lease shortcuts.
    for (let attempt = 1; attempt < INVOICE_PDF_MAX_ATTEMPTS; attempt++) {
      await jobs.attemptFailed(identity!.jobId, identity!.leaseVersion, false, 'RENDER_UNAVAILABLE', `${requestId}-drain-${attempt}`);
      identity = await jobs.claim('pdf-spec-worker');
    }
    expect(identity!.attempts).toBe(INVOICE_PDF_MAX_ATTEMPTS);
    await jobs.attemptFailed(identity!.jobId, identity!.leaseVersion, true, 'RENDER_TIMEOUT', `${requestId}-final`);
    expect(await prisma.invoicePdfRenderJob.findUnique({ where: { id: identity!.jobId } })).toMatchObject({
      status: 'FAILED', failureReason: 'RENDER_TIMEOUT', leaseOwner: null, attempts: INVOICE_PDF_MAX_ATTEMPTS,
    });
    expect(await prisma.invoicePdfStorageCapacity.findUnique({ where: { id: 'invoice-pdf' } })).toMatchObject({ pendingJobCount: 0 });
    // The failed key never fakes progress again; a fresh key opens a bounded retry.
    await expect(staffRequest(issued.documentId, failedKey)).rejects.toMatchObject(code('INVOICE_PDF_NOT_READY'));
    const fresh = await staffRequest(issued.documentId, key());
    expect(fresh.status).toBe('PENDING');
    expect(queued).toHaveLength(2);
    expect(await prisma.invoicePdfRenderJob.count({ where: { documentId: issued.documentId } })).toBe(2);
  });

  it('rejects evidence outside the declared artifact identity and bounds', async () => {
    await reset();
    queued.length = 0;
    await enablePdf();
    const issued = await issueDocument();
    await staffRequest(issued.documentId, key());
    const identity = await jobs.claim('pdf-spec-worker');
    const oversized = Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(INVOICE_PDF_LIMITS.pdfBytes)]);
    await expect(jobs.completeRender(identity!, oversized, requestId)).rejects.toMatchObject(code('INVOICE_PDF_ARTIFACT_INVALID'));
    await expect(jobs.completeRender(identity!, Buffer.from('JFIF not pdf'), requestId)).rejects.toMatchObject(code('INVOICE_PDF_ARTIFACT_INVALID'));
    expect(await prisma.invoicePdfRenderJob.findUnique({ where: { id: identity!.jobId } })).toMatchObject({ status: 'RUNNING' });
    expect(await prisma.invoicePdfArtifact.count()).toBe(0);
    const bytes = pdfBytes('acceptance-bounds');
    expect(await jobs.completeRender(identity!, bytes, requestId)).toBe('READY');
  });

  it('enforces pending capacity across distinct documents and disables claiming when off', async () => {
    await reset();
    queued.length = 0;
    await enablePdf({ maxPendingJobs: 1 });
    const first = await issueDocument();
    const second = await issueDocument();
    expect(first.documentId).not.toBe(second.documentId);
    await staffRequest(first.documentId, key());
    expect(await prisma.invoicePdfStorageCapacity.findUnique({ where: { id: 'invoice-pdf' } })).toMatchObject({ pendingJobCount: 1 });
    await expect(staffRequest(second.documentId, key())).rejects.toMatchObject(code('INVOICE_PDF_CAPACITY_EXCEEDED'));
    expect(await prisma.invoicePdfRenderJob.count({ where: { documentId: second.documentId } })).toBe(0);
    await expect(jobs.claim('pdf-spec-worker')).resolves.not.toBeNull();
    await enablePdf({ enabled: false });
    expect(await jobs.claim('pdf-spec-worker')).toBeNull();
    await expect(staffRequest(second.documentId, key())).rejects.toMatchObject(code('INVOICE_PDF_DISABLED'));
  });

  it('keeps the render-job trigger guard honest against fabricated states', async () => {
    await reset();
    queued.length = 0;
    await enablePdf();
    const issued = await issueDocument();
    await staffRequest(issued.documentId, key());
    const jobId = queued[queued.length - 1]!;
    const real = await prisma.invoicePdfRenderJob.findUnique({ where: { id: jobId } });
    // Insert must start PENDING with no lease.
    await expect(prisma.invoicePdfRenderJob.create({ data: {
      documentId: issued.documentId, documentPayloadHash: real!.documentPayloadHash,
      renderInputHash: 'f'.repeat(64), rendererRevision: 'identity-under-test',
      templateRevision: INVOICE_PDF_TEMPLATE_REVISION, fontSha256: INVOICE_PDF_ASSETS.fontSha256,
      status: 'READY', requestedByUserId: actorId, requestedByScope: 'staff',
      requestKeyHash: 'e'.repeat(64), payloadHash: 'd'.repeat(64) } }))
      .rejects.toThrow(/PENDING without a lease/u);
    // Render identity is immutable after creation.
    await expect(prisma.invoicePdfRenderJob.update({ where: { id: jobId }, data: { documentPayloadHash: 'e'.repeat(64) } }))
      .rejects.toThrow(/identity is immutable/u);
    // READY completion requires the lease transition path, not direct editing.
    await expect(prisma.invoicePdfRenderJob.update({ where: { id: jobId }, data: { status: 'READY' } }))
      .rejects.toThrow(/state transition is not permitted/u);
        expect(await prisma.invoicePdfRenderJob.findUnique({ where: { id: jobId } })).toMatchObject({ status: 'PENDING' });
  });
});

