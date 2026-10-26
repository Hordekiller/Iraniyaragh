import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../../database/prisma.service';
import { assertIsolatedTestDatabase } from '../../test/database-url.guard';
import { AuditLogService } from '../audit/audit-log.service';
import type { ReportExportDefinition } from '@iranyaragh/contracts';
import { CreditAccountStatus, CreditEntryKind, OrderStatus, ReceivableDocumentKind } from '@prisma/client';
import {
  ReportExportArtifactStore,
  REPORT_EXPORT_ARTIFACT_RETENTION_MS,
} from './report-export-artifact.store';
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
    enqueue: async (jobId: string) => {
      queued.push(jobId);
    },
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
  const code = (name: string) =>
    expect.objectContaining({
      response: expect.objectContaining({ code: name }),
    });

  async function clearExports() {
    assertIsolatedTestDatabase({
      databaseUrl: process.env.DATABASE_URL,
      nodeEnvironment: process.env.NODE_ENV,
    });
    await prisma.$executeRawUnsafe(
      'TRUNCATE "ReportExportCommand", "ReportExportArtifact", "ReportExportSnapshot", "ReportExportJob", "ReportExportStorageCapacity"',
    );
  }

  async function enableExport(option: { enabled?: boolean; maxPendingJobs?: number } = {}) {
    await prisma.reportExportStorageCapacity.upsert({
      where: { id: 'report-export' },
      create: {
        id: 'report-export',
        budgetBytes: 8n * 1024n * 1024n,
        maxArtifacts: 8,
        maxPendingJobs: option.maxPendingJobs ?? 2,
        maxRetentionMs: BigInt(REPORT_EXPORT_ARTIFACT_RETENTION_MS),
        isEnabled: option.enabled !== false,
        storedBytes: 0n,
        artifactCount: 0,
        pendingJobCount: 0,
        version: 1,
      },
      update: {
        isEnabled: option.enabled !== false,
        maxPendingJobs: option.maxPendingJobs ?? 2,
        maxArtifacts: 8,
        budgetBytes: 8n * 1024n * 1024n,
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
      actorId,
      requestId: `${requestId}-${sequence++}`,
      definition,
      outputFormat,
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
    assertIsolatedTestDatabase({
      databaseUrl: process.env.DATABASE_URL,
      nodeEnvironment: process.env.NODE_ENV,
    });
    await prisma.$connect();
    connected = true;
    await clearExports();
    staffActorId = (
      await prisma.user.create({
        data: { email: `staff-${run}@example.test`, status: 'ACTIVE' },
      })
    ).id;
    operatorActorId = (
      await prisma.user.create({
        data: { email: `operator-${run}@example.test`, status: 'ACTIVE' },
      })
    ).id;
    buyerUserId = (
      await prisma.user.create({
        data: { email: `buyer-${run}@example.test`, status: 'ACTIVE' },
      })
    ).id;
    customerId = (
      await prisma.customer.create({
        data: {
          userId: buyerUserId,
          mobile: `+98912000${(10000000n + (BigInt(`0x${run.slice(0, 10)}`) % 10000000n)).toString().slice(0, 5)}`,
          firstName: 'Export',
          lastName: 'Buyer',
        },
      })
    ).id;
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
    await prisma.user.deleteMany({
      where: { id: { in: [staffActorId, buyerUserId] } },
    });
    await prisma.$disconnect();
  });

  it('rejects export requests while the capacity row is not approved', async () => {
    await clearExports();
    await enableExport({ enabled: false });
    await expect(requestExport(summaryDefinition(), 'csv')).rejects.toThrow(code('REPORT_EXPORT_DISABLED'));
  });

  it('completes an approved orders export lifecycle end to end', async () => {
    await resetForLifecycle();
    const now = new Date();
    orderId = (
      await prisma.order.create({
        data: {
          number: `export-${run}`,
          customerId,
          status: OrderStatus.PAID,
          subtotal: 5000n,
          discount: 0n,
          shipping: 0n,
          grandTotal: 5000n,
          addressSnapshot: { synthetic: true },
          shippingMethod: 'isolated',
          shippingMethodTitle: 'Isolated shipping',
          shippingPolicyRevision: `isolated-${run}`,
          pricePolicyRevision: `isolated-${run}`,
          reservationExpiresAt: new Date(now.getTime() + 60_000),
          createdAt: now,
        },
      })
    ).id;
    const requested = await requestExport(
      {
        kind: 'orders' as const,
        filters: orderFilters(),
        maxRows: 20_000,
      },
      'csv',
    );
    expect(requested.status).toBe('PENDING');
    expect(requested.replayed).toBe(false);
    expect(queued[queued.length - 1]).toBe(requested.exportId);
    expect((await jobs.status(requested.exportId, staffActorId)).status).toBe('PENDING');
    const claimed = await jobs.claim('export-worker-1');
    expect(claimed?.reportKind).toBe('orders');
    expect(claimed?.outputFormat).toBe('csv');
    expect(claimed?.attempts).toBe(1);
    expect(
      (
        await prisma.reportExportStorageCapacity.findUnique({
          where: { id: 'report-export' },
        })
      )?.pendingJobCount,
    ).toBe(1);
    const table = await renderer.render(claimed!.definition);
    expect(table.headers[0]).toBe('id');
    const own = table.rows.find((row) => row[1] === `export-${run}`);
    expect(own).toBeTruthy();
    expect(own![5]).toBe('5000');
    await jobs.persistSnapshot(claimed!, table);
    const bytes = await serializeExport('csv', table);
    expect(bytes.subarray(0, 4).toString('utf8')).toBe('\ufeff"');
    expect(await jobs.completeRender(claimed!, bytes, `render-${requested.exportId}`)).toBe('READY');
    const ready = await jobs.status(requested.exportId, staffActorId);
    expect(ready.status).toBe('READY');
    expect(ready.byteCount).toBe(bytes.length);
    expect(ready.sha256).toMatch(/^[a-f0-9]{64}$/u);
    const capacity = await prisma.reportExportStorageCapacity.findUnique({
      where: { id: 'report-export' },
    });
    expect(capacity?.pendingJobCount).toBe(0);
    expect(capacity?.artifactCount).toBe(1);
    expect(capacity?.storedBytes).toBe(BigInt(bytes.length));
    const download = await jobs.downloadStaff(requested.exportId, staffActorId, requestId);
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
    await jobs.persistSnapshot(claimed!, {
      headers: ['value'],
      rows: [['8000']],
      generatedAt: new Date().toISOString(),
      truncated: false,
    });
    const bytes = Buffer.concat([Buffer.from('PK'), Buffer.from(`isolated-${first.exportId}`, 'utf8')]);
    expect(await jobs.completeRender(claimed!, bytes, `render-${first.exportId}`)).toBe('READY');
    const replay = await requestExport(definition, 'xlsx', replayKey);
    expect(replay.status).toBe('READY');
    expect(replay.replayed).toBe(true);
    expect(replay.exportId).toBe(first.exportId);
    expect(replay.byteCount).toBe(bytes.length);
    // A fresh key always requests fresh evidence, even with equal filters.
    const attached = await requestExport(definition, 'xlsx');
    expect(attached.status).toBe('PENDING');
    expect(attached.exportId).not.toBe(first.exportId);
    expect(attached.replayed).toBe(false);
  });

  it('declines replay of a failed export and keeps capacity honest', async () => {
    await resetForLifecycle();
    const definition = debtorsDefinition();
    const failedKey = key();
    const failed = await requestExport(definition, 'csv', failedKey);
    const claimed = await jobs.claim('export-worker-1');
    expect(claimed?.reportKind).toBe('debtors');
    await jobs.attemptFailed(
      claimed!.jobId,
      claimed!.leaseVersion,
      true,
      'RENDER_TIMEOUT',
      `render-${failed.exportId}`,
    );
    for (let attempt = 1; attempt < REPORT_EXPORT_MAX_ATTEMPTS; attempt++) {
      const next = await jobs.claim('export-worker-1');
      await jobs.attemptFailed(
        next!.jobId,
        next!.leaseVersion,
        false,
        'RENDER_TIMEOUT',
        `render-${failed.exportId}`,
      );
    }
    const capacity = await prisma.reportExportStorageCapacity.findUnique({
      where: { id: 'report-export' },
    });
    expect(capacity?.pendingJobCount).toBe(0);
    expect(capacity?.artifactCount).toBe(0);
    await expect(requestExport(definition, 'csv', failedKey)).rejects.toThrow(
      code('REPORT_EXPORT_NOT_READY'),
    );
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
    const workload = await prisma.reportExportJob.findUnique({
      where: { id: requested.exportId },
    });
    expect(workload?.status).toBe('FAILED');
    expect(workload?.failureReason).toBe('RENDER_UNAVAILABLE');
    expect(workload?.attempts).toBe(REPORT_EXPORT_MAX_ATTEMPTS);
    expect(await jobs.claim('export-worker-1')).toBeNull();
    const capacity = await prisma.reportExportStorageCapacity.findUnique({
      where: { id: 'report-export' },
    });
    expect(capacity?.pendingJobCount).toBe(0);
    expect(capacity?.artifactCount).toBe(0);
  });

  it('rejects stale lease publication and preserves a materialized table across retries', async () => {
    await resetForLifecycle();
    const requested = await requestExport(debtorsDefinition(), 'csv');
    const first = (await jobs.claim('export-worker-1'))!;
    const table = {
      headers: ['amount'],
      rows: [['900719925474099312345']],
      generatedAt: new Date().toISOString(),
      truncated: false,
    };
    await jobs.persistSnapshot(first, table);
    await jobs.attemptFailed(first.jobId, first.leaseVersion, true, 'RENDER_FAILED', requestId);
    expect(await jobs.completeRender(first, Buffer.from('stale'), requestId)).toBe('STALE');
    expect(await prisma.reportExportArtifact.count()).toBe(0);
    const retry = (await jobs.claim('export-worker-2'))!;
    expect(await jobs.readSnapshot(retry)).toEqual(table);
    expect(
      await jobs.persistSnapshot(retry, {
        ...table,
        rows: [['changed live data']],
      }),
    ).toEqual(table);
    const bytes = await serializeExport('csv', (await jobs.readSnapshot(retry))!);
    expect(await jobs.completeRender(retry, bytes, requestId)).toBe('READY');
    await expect(jobs.status(requested.exportId, operatorActorId)).rejects.toThrow(
      code('REPORT_EXPORT_NOT_READY'),
    );
    await expect(jobs.downloadStaff(requested.exportId, operatorActorId, requestId)).rejects.toThrow(
      code('REPORT_EXPORT_NOT_READY'),
    );
    expect(
      await prisma.auditLog.count({
        where: {
          action: 'report.export.downloaded',
          entityId: requested.exportId,
        },
      }),
    ).toBe(0);
    const view = await jobs.snapshotStaff(requested.exportId, staffActorId, requestId);
    expect(view.rows).toEqual(table.rows);
    await expect(jobs.snapshotStaff(requested.exportId, operatorActorId, requestId)).rejects.toThrow(
      code('REPORT_EXPORT_NOT_READY'),
    );
    await jobs.downloadStaff(requested.exportId, staffActorId, requestId);
    expect(
      await prisma.auditLog.count({
        where: {
          action: 'report.export.downloaded',
          entityId: requested.exportId,
        },
      }),
    ).toBe(1);
    await expect(
      prisma.reportExportSnapshot.update({
        where: { jobId: requested.exportId },
        data: { rowCount: 0 },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.reportExportSnapshot.delete({
        where: { jobId: requested.exportId },
      }),
    ).rejects.toThrow();
    expect(await store.cleanupExpired(new Date(), requestId)).toEqual({
      freed: 0,
    });
  });

  it('rejects changed idempotency payloads and isolates equal requests by owner', async () => {
    await resetForLifecycle();
    const definition = debtorsDefinition();
    const sameKey = key();
    const first = await requestExport(definition, 'csv', sameKey);
    await expect(requestExport(definition, 'xlsx', sameKey)).rejects.toThrow(code('IDEMPOTENCY_CONFLICT'));
    const other = await requestExport(definition, 'csv', sameKey, operatorActorId);
    expect(other.exportId).not.toBe(first.exportId);
    expect((await requestExport(definition, 'csv', sameKey)).exportId).toBe(first.exportId);
    expect(queued.filter((id) => id === first.exportId)).toHaveLength(2);
  });

  it('cleans expired bytes and snapshots, retaining immutable job/command history', async () => {
    await resetForLifecycle();
    await prisma.reportExportStorageCapacity.update({
      where: { id: 'report-export' },
      data: { maxRetentionMs: 250n, version: { increment: 1 } },
    });
    const result = await requestExport(debtorsDefinition(), 'csv');
    const identity = (await jobs.claim('export-worker-1'))!;
    const table = await jobs.persistSnapshot(identity, {
      headers: ['amount'],
      rows: [['1']],
      generatedAt: new Date().toISOString(),
      truncated: false,
    });
    await jobs.completeRender(identity, await serializeExport('csv', table), requestId);
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SET LOCAL app.report_export_cleanup = 'on'`;
        await tx.reportExportArtifact.delete({ where: { jobId: result.exportId } });
      }),
    ).rejects.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 300));
    await expect(jobs.downloadStaff(result.exportId, staffActorId, requestId)).rejects.toThrow(
      code('REPORT_EXPORT_ARTIFACT_EXPIRED'),
    );
    expect(await store.cleanupExpired(new Date(), requestId)).toEqual({ freed: 1 });
    expect(await prisma.reportExportSnapshot.count()).toBe(0);
    const capacity = await prisma.reportExportStorageCapacity.findUniqueOrThrow({
      where: { id: 'report-export' },
    });
    expect(capacity.snapshotBytes).toBe(0n);
    expect(capacity.storedBytes).toBe(0n);
    expect(capacity.artifactCount).toBe(0);
    expect(await prisma.reportExportJob.count()).toBe(1);
    expect(await prisma.reportExportCommand.count()).toBe(1);
  });

  it('recovers expired leases and terminalizes a crashed final attempt', async () => {
    await resetForLifecycle();
    const requested = await requestExport(debtorsDefinition(), 'csv');
    const realNow = Date.now();
    for (let attempt = 1; attempt <= REPORT_EXPORT_MAX_ATTEMPTS; attempt++) {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(realNow - (REPORT_EXPORT_MAX_ATTEMPTS - attempt + 1) * 60_000);
      try {
        expect((await jobs.claim('crashed-worker'))?.attempts).toBe(attempt);
      } finally {
        vi.useRealTimers();
      }
    }
    expect(await jobs.claim('replacement-worker')).toBeNull();
    expect(
      (await prisma.reportExportJob.findUniqueOrThrow({ where: { id: requested.exportId } })).status,
    ).toBe('FAILED');
    expect(
      (await prisma.reportExportStorageCapacity.findUniqueOrThrow({ where: { id: 'report-export' } }))
        .pendingJobCount,
    ).toBe(0);
  });

  it('debtor snapshots surface ledger-backed aging buckets', async () => {
    await resetForLifecycle();
    // A dedicated synthetic customer stays behind with its append-only credit
    // evidence (the credit domain forbids those rows from deletion); the
    // run-scoped identifier keeps cross-suite runs isolated.
    const debtorUser = await prisma.user.create({
      data: { email: `debtor-${run}@example.test`, status: 'ACTIVE' },
    });
    debtorCustomerId = (
      await prisma.customer.create({
        data: {
          userId: debtorUser.id,
          mobile: `+98913${(1000000n + (BigInt(`0x${run.slice(0, 10)}`) % 9000000n)).toString().slice(0, 7)}`,
          firstName: 'Debtor',
          lastName: 'Synthetic',
        },
      })
    ).id;
    // A document and its matching-kind ledger entry reconcile under one
    // database transaction; the opening-balance shape avoids the order
    // domain evidence the SALE kind demands.
    const issuedAt = new Date(Date.now() - 10 * 86400000);
    debtorAccountId = (
      await prisma.$transaction(async (tx) => {
        const account = await tx.creditAccount.create({
          data: {
            customerId: debtorCustomerId,
            status: CreditAccountStatus.ACTIVE,
            creditLimit: 10000000n,
            termsDays: 30,
            version: 1,
          },
        });
        const document = await tx.receivableDocument.create({
          data: {
            accountId: account.id,
            kind: ReceivableDocumentKind.OPENING_BALANCE,
            amount: 8000n,
            issuedAt,
            dueAt: new Date(Date.now() + 20 * 86400000),
            termsDays: 30,
            sourceReference: `isolated-${run}`,
            actorId: operatorActorId,
            requestId,
          },
        });
        await tx.creditLedgerEntry.create({
          data: {
            accountId: account.id,
            documentId: document.id,
            kind: CreditEntryKind.OPENING_BALANCE,
            amount: 8000n,
            effectiveAt: issuedAt,
            actorId: operatorActorId,
            requestId,
          },
        });
        return account;
      })
    ).id;
    const table = await renderer.render({
      kind: 'debtors',
      debtors: { asOf: new Date().toISOString() },
      maxRows: 20_000,
    });
    expect(table.headers).toContain('outstanding');
    const ours = table.rows.find((row) => row[0] === debtorCustomerId && row[1] === debtorAccountId);
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
