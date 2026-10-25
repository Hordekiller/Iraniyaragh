import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../database/prisma.service';
import { assertIsolatedTestDatabase } from '../../test/database-url.guard';
import { AuditLogService } from '../audit/audit-log.service';
import type { ReportExportDefinition } from '@iranyaragh/contracts';
import { CreditAccountStatus, CreditEntryKind, OrderStatus, ReceivableDocumentKind } from '@prisma/client';
import { ReportExportArtifactStore, REPORT_EXPORT_ARTIFACT_RETENTION_MS } from './report-export-artifact.store';
import { REPORT_EXPORT_MAX_ATTEMPTS, ReportExportJobService } from './report-export-job.service';
import { ReportExportRenderer } from './report-export.renderer';
import { OperationalReportService } from './operational-report.service';
import { serializeExport } from './report-export.format';

describe.sequential('Report export render jobs PostgreSQL acceptance', () => {
  const prisma = new PrismaService();
  const audit = new AuditLogService(prisma);
  const store = new ReportExportArtifactStore(prisma, audit);
  const reports = new OperationalReportService(prisma);
  const renderer = new ReportExportRenderer(reports);
  const queued: string[] = [];
  const queue = {
    enqueue: async (jobId: string) => { queued.push(jobId); },
  };
  // The queue port is structurally satisfied by the recording test double.
  const jobs = new ReportExportJobService(prisma, audit, store, queue as never);
  const run = randomUUID().replaceAll('-', '').slice(0, 20);
  const requestId = `report-export-${run}`;
  let staffActorId = '';
  let buyerUserId = '';
  let operatorActorId = '';
  let customerId = '';
  let orderId = '';
  let debtorCustomerId = '';
  let debtorAccountId = '';
  let connected = false;
  let sequence = 0;
  const key = () => `export-${run}-${sequence++}`;
  const code = (name: string) => expect.objectContaining({ response: expect.objectContaining({ code: name }) });

  async function clearExports() {
    assertIsolatedTestDatabase({ databaseUrl: process.env.DATABASE_URL, nodeEnvironment: process.env.NODE_ENV });
    await prisma.$executeRawUnsafe('TRUNCATE "ReportExportCommand", "ReportExportArtifact", "ReportExportJob", "ReportExportStorageCapacity"');
  }

  async function enableExport(option: { enabled?: boolean; maxPendingJobs?: number } = {}) {
    await prisma.reportExportStorageCapacity.upsert({
      where: { id: 'report-export' },
      create: {
        id: 'report-export', budgetBytes: 8n * 1024n * 1024n, maxArtifacts: 8,
        maxPendingJobs: option.maxPendingJobs ?? 2,
        maxRetentionMs: BigInt(REPORT_EXPORT_ARTIFACT_RETENTION_MS),
        isEnabled: option.enabled !== false,
        storedBytes: 0n, artifactCount: 0, pendingJobCount: 0, version: 1,
      },
      update: {
        isEnabled: option.enabled !== false, maxPendingJobs: option.maxPendingJobs ?? 2,
        maxArtifacts: 8, budgetBytes: 8n * 1024n * 1024n,
        maxRetentionMs: BigInt(REPORT_EXPORT_ARTIFACT_RETENTION_MS),
        version: { increment: 1 },
      },
    });
  }

  async function requestExport(
    definition: ReportExportDefinition,
    outputFormat: 'csv' | 'xlsx',
    explicitKey?: string,
    actorId = staffActorId,
  ) {
    return jobs.request({
      actorId, requestId: `${requestId}-${sequence++}`, definition, outputFormat,
      key: explicitKey ?? key(),
    });
  }

  const orderFilters = () => ({
    from: new Date(Date.now() - 3_600_000).toISOString(),
    toExclusive: new Date(Date.now() + 3_600_000).toISOString(),
  });
  const summaryDefinition = () => ({
    kind: 'operations-summary' as const,
    filters: { ...orderFilters(), grain: 'day' as const },
    maxRows: 20_000,
  });
  const debtorsDefinition = () => ({
    kind: 'debtors' as const,
    debtors: { asOf: new Date().toISOString() },
    maxRows: 20_000,
  });

  beforeAll(async () => {
    assertIsolatedTestDatabase({ databaseUrl: process.env.DATABASE_URL, nodeEnvironment: process.env.NODE_ENV });
    await prisma.$connect();
    connected = true;
    await clearExports();
    staffActorId = (await prisma.user.create({ data: { email: `staff-${run}@example.test`, status: 'ACTIVE' } })).id;
    operatorActorId = (await prisma.user.create({ data: { email: `operator-${run}@example.test`, status: 'ACTIVE' } })).id;
    buyerUserId = (await prisma.user.create({ data: { email: `buyer-${run}@example.test`, status: 'ACTIVE' } })).id;
    customerId = (await prisma.customer.create({ data: {
      userId: buyerUserId,
      mobile: `+98912000${(10000000n + (BigInt(`0x${run.slice(0, 10)}`) % 10000000n)).toString().slice(0, 5)}`,
      firstName: 'Export', lastName: 'Buyer',
    } })).id;
  });

  afterAll(async () => {
    if (!connected) return;
    await clearExports();
    await enableExport({ enabled: false });
    // The synthetic opening-balance credit evidence is append-only by design
    // and stays behind with its run-scoped identifier; the export artifacts
    // and capacity row are the only surfaces this suite owns.
    if (orderId) {
      await prisma.stockReservation.deleteMany({ where: { orderId } });
      await prisma.orderTransition.deleteMany({ where: { orderId } });
      await prisma.staffOrderCommandRecord.deleteMany({ where: { orderId } });
      await prisma.order.deleteMany({ where: { id: orderId } });
    }
    await prisma.customer.deleteMany({ where: { id: customerId } });
    // operatorActorId stays: the append-only receivable document pins its
    // creator actor by a RESTRICT foreign key.
    await prisma.user.deleteMany({ where: { id: { in: [staffActorId, buyerUserId] } } });
    await prisma.$disconnect();
  });

  it('rejects export requests while the capacity row is not approved', async () => {
    await clearExports();
    await enableExport({ enabled: false });
    await expect(requestExport(summaryDefinition(), 'csv'))
      .rejects.toThrow(code('REPORT_EXPORT_DISABLED'));
  });

  it('completes an approved orders export lifecycle end to end', async () => {
    await resetForLifecycle();
    const now = new Date();
    orderId = (await prisma.order.create({ data: {
      number: `export-${run}`, customerId, status: OrderStatus.PAID,
      subtotal: 5000n, discount: 0n, shipping: 0n, grandTotal: 5000n,
      addressSnapshot: { synthetic: true },
      shippingMethod: 'isolated', shippingMethodTitle: 'Isolated shipping',
      shippingPolicyRevision: `isolated-${run}`, pricePolicyRevision: `isolated-${run}`,
      reservationExpiresAt: new Date(now.getTime() + 60_000),
      createdAt: now,
    } })).id;
    const requested = await requestExport({
      kind: 'orders' as const,
      filters: orderFilters(),
      maxRows: 20_000,
    }, 'csv');
    expect(requested.status).toBe('PENDING');
    expect(requested.replayed).toBe(false);
    expect(queued[queued.length - 1]).toBe(requested.exportId);
    expect((await jobs.status(requested.exportId)).status).toBe('PENDING');
    const claimed = await jobs.claim('export-worker-1');
    expect(claimed?.reportKind).toBe('orders');
    expect(claimed?.outputFormat).toBe('csv');
    expect(claimed?.attempts).toBe(1);
    expect((await prisma.reportExportStorageCapacity.findUnique({ where: { id: 'report-export' } }))?.pendingJobCount).toBe(1);
    const table = await renderer.render(claimed!.definition);
    expect(table.headers[0]).toBe('id');
    const own = table.rows.find(row => row[1] === `export-${run}`);
    expect(own).toBeTruthy();
    expect(own![5]).toBe('5000');
    const bytes = await serializeExport('csv', table);
    expect(bytes.subarray(0, 4).toString('utf8')).toBe('\ufeff"');
    expect(await jobs.completeRender(claimed!, bytes, `render-${requested.exportId}`)).toBe('READY');
    const ready = await jobs.status(requested.exportId);
    expect(ready.status).toBe('READY');
    expect(ready.byteCount).toBe(bytes.length);
    expect(ready.sha256).toMatch(/^[a-f0-9]{64}$/u);
    const capacity = await prisma.reportExportStorageCapacity.findUnique({ where: { id: 'report-export' } });
    expect(capacity?.pendingJobCount).toBe(0);
    expect(capacity?.artifactCount).toBe(1);
    expect(capacity?.storedBytes).toBe(BigInt(bytes.length));
    const download = await jobs.downloadStaff(requested.exportId);
    expect(download.bytes.equals(bytes)).toBe(true);
    expect(download.contentType.startsWith('text/csv')).toBe(true);
    expect(download.filename).toMatch(/^iranyaragh-orders-\d{8}\.csv$/);
  });

  it('replays an approved export request with the same idempotency key', async () => {
    await resetForLifecycle();
    const definition = debtorsDefinition();
    const replayKey = key();
    const first = await requestExport(definition, 'xlsx', replayKey);
    const claimed = await jobs.claim('export-worker-1');
    expect(claimed?.outputFormat).toBe('xlsx');
    const bytes = Buffer.concat([Buffer.from('PK'), Buffer.from(`isolated-${first.exportId}`, 'utf8')]);
    expect(await jobs.completeRender(claimed!, bytes, `render-${first.exportId}`)).toBe('READY');
    const replay = await requestExport(definition, 'xlsx', replayKey);
    expect(replay.status).toBe('READY');
    expect(replay.replayed).toBe(true);
    expect(replay.exportId).toBe(first.exportId);
    expect(replay.byteCount).toBe(bytes.length);
    // A different key attaches to the same immutable definition instead of
    // minting a duplicate job while the artifact stays within retention.
    const attached = await requestExport(definition, 'xlsx');
    expect(attached.status).toBe('READY');
    expect(attached.exportId).toBe(first.exportId);
    expect(attached.replayed).toBe(false);
  });

  it('declines replay of a failed export and keeps capacity honest', async () => {
    await resetForLifecycle();
    const definition = debtorsDefinition();
    const failedKey = key();
    const failed = await requestExport(definition, 'csv', failedKey);
    const claimed = await jobs.claim('export-worker-1');
    expect(claimed?.reportKind).toBe('debtors');
    await jobs.attemptFailed(claimed!.jobId, claimed!.leaseVersion, true, 'RENDER_TIMEOUT', `render-${failed.exportId}`);
    const capacity = await prisma.reportExportStorageCapacity.findUnique({ where: { id: 'report-export' } });
    expect(capacity?.pendingJobCount).toBe(0);
    expect(capacity?.artifactCount).toBe(0);
    await expect(requestExport(definition, 'csv', failedKey))
      .rejects.toThrow(code('REPORT_EXPORT_NOT_READY'));
    const fresh = await requestExport(definition, 'csv');
    expect(fresh.status).toBe('PENDING');
    expect(fresh.replayed).toBe(false);
    expect(fresh.exportId).not.toBe(failed.exportId);
  });

  it('burns the bounded attempt budget before terminal failure', async () => {
    await resetForLifecycle();
    const definition = summaryDefinition();
    const requested = await requestExport(definition, 'csv');
    let previous = 0;
    for (let attempt = 1; attempt <= REPORT_EXPORT_MAX_ATTEMPTS; attempt += 1) {
      const claimed = await jobs.claim('export-worker-1');
      expect(claimed?.attempts).toBe(previous + 1);
      previous = claimed!.attempts;
      await jobs.attemptFailed(
        claimed!.jobId,
        claimed!.leaseVersion,
        attempt === REPORT_EXPORT_MAX_ATTEMPTS,
        'RENDER_UNAVAILABLE',
        `render-${requested.exportId}-${attempt}`,
      );
    }
    const workload = await prisma.reportExportJob.findUnique({ where: { id: requested.exportId } });
    expect(workload?.status).toBe('FAILED');
    expect(workload?.failureReason).toBe('RENDER_UNAVAILABLE');
    expect(workload?.attempts).toBe(REPORT_EXPORT_MAX_ATTEMPTS);
    expect(await jobs.claim('export-worker-1')).toBeNull();
    const capacity = await prisma.reportExportStorageCapacity.findUnique({ where: { id: 'report-export' } });
    expect(capacity?.pendingJobCount).toBe(0);
    expect(capacity?.artifactCount).toBe(0);
  });

  it('frees expired storage bytes only inside a cleanup session', async () => {
    await resetForLifecycle();
    const definition = summaryDefinition();
    const requested = await requestExport(definition, 'csv');
    const claimed = await jobs.claim('export-worker-1');
    const bytes = await serializeExport('csv', await renderer.render(claimed!.definition));
    expect(await jobs.completeRender(claimed!, bytes, `render-${requested.exportId}`)).toBe('READY');
    const expiredOwner = await requestExport(definition, 'xlsx');
    const finalClaim = await jobs.claim('export-worker-1');
    await jobs.attemptFailed(finalClaim!.jobId, finalClaim!.leaseVersion, true, 'RENDER_FAILED', `render-${expiredOwner.exportId}`);
    // The artifact store never persists expired bytes; a raw expired insert is
    // admitted by the reserve trigger and charged against capacity, then only
    // a cleanup session may delete it.
    // Evidence integrity never relaxes: the stale insert must still satisfy
    // the byte/sha identity checks; only the retention moment is in the past.
    await prisma.$executeRawUnsafe(`INSERT INTO "ReportExportArtifact" ("id","jobId","jobRequestKeyHash","reportKind","outputFormat","definitionHash","rendererRevision","contentSha256","byteCount","bytes","expiresAt","createdAt") VALUES ('${expiredOwner.exportId}', '${expiredOwner.exportId}', '${finalClaim!.requestKeyHash}', 'operations-summary', 'xlsx', '${finalClaim!.definitionHash}', 'report-export-1', '8009a855b4e0e279d66ebd410e5ed7ecc55af814a8fb01a1c5f8a61da324cb66', 7, 'PKhello', CURRENT_TIMESTAMP - INTERVAL '1 minute', CURRENT_TIMESTAMP)`);
    const before = await prisma.reportExportStorageCapacity.findUnique({ where: { id: 'report-export' } });
    expect(before?.storedBytes).toBe(BigInt(bytes.length + 7));
    expect(before?.artifactCount).toBe(2);
    await expect(prisma.$executeRawUnsafe(`DELETE FROM "ReportExportArtifact" WHERE "id" = '${expiredOwner.exportId}'`)).rejects.toThrow();
    const cleaned = await store.cleanupExpired(new Date(), `cleanup-${run}`);
    expect(cleaned.freed).toBe(1);
    const after = await prisma.reportExportStorageCapacity.findUnique({ where: { id: 'report-export' } });
    expect(after?.storedBytes).toBe(BigInt(bytes.length));
    expect(after?.artifactCount).toBe(1);
    const download = await jobs.downloadStaff(requested.exportId);
    expect(download.bytes.equals(bytes)).toBe(true);
  });

  it('debtor snapshots surface ledger-backed aging buckets', async () => {
    await resetForLifecycle();
    // A dedicated synthetic customer stays behind with its append-only credit
    // evidence (the credit domain forbids those rows from deletion); the
    // run-scoped identifier keeps cross-suite runs isolated.
    const debtorUser = await prisma.user.create({ data: { email: `debtor-${run}@example.test`, status: 'ACTIVE' } });
    debtorCustomerId = (await prisma.customer.create({ data: {
      userId: debtorUser.id,
      mobile: `+98913${(1000000n + (BigInt(`0x${run.slice(0, 10)}`) % 9000000n)).toString().slice(0, 7)}`,
      firstName: 'Debtor', lastName: 'Synthetic',
    } })).id;
    // A document and its matching-kind ledger entry reconcile under one
    // database transaction; the opening-balance shape avoids the order
    // domain evidence the SALE kind demands.
    const issuedAt = new Date(Date.now() - 10 * 86400000);
    debtorAccountId = (await prisma.$transaction(async (tx) => {
      const account = await tx.creditAccount.create({ data: {
        customerId: debtorCustomerId, status: CreditAccountStatus.ACTIVE, creditLimit: 10000000n, termsDays: 30, version: 1,
      } });
      const document = await tx.receivableDocument.create({ data: {
        accountId: account.id, kind: ReceivableDocumentKind.OPENING_BALANCE, amount: 8000n,
        issuedAt, dueAt: new Date(Date.now() + 20 * 86400000),
        termsDays: 30, sourceReference: `isolated-${run}`, actorId: operatorActorId, requestId,
      } });
      await tx.creditLedgerEntry.create({ data: {
        accountId: account.id, documentId: document.id, kind: CreditEntryKind.OPENING_BALANCE,
        amount: 8000n, effectiveAt: issuedAt,
        actorId: operatorActorId, requestId,
      } });
      return account;
    })).id;
    const table = await renderer.render({ kind: 'debtors', debtors: { asOf: new Date().toISOString() }, maxRows: 20_000 });
    expect(table.headers).toContain('outstanding');
    const ours = table.rows.find(row => row[0] === debtorCustomerId && row[1] === debtorAccountId);
    expect(ours).toBeTruthy();
    expect(ours![table.headers.indexOf('outstanding')]).toBe('8000');
    // The artifact surface excludes identity columns: only canonical slugs.
    expect(table.headers).not.toContain('customerName');
  });

  async function resetForLifecycle(): Promise<void> {
    await clearExports();
    await enableExport();
    queued.length = 0;
    sequence = 0;
  }
});
