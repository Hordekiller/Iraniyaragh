import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../database/prisma.service';
import { assertIsolatedTestDatabase } from '../../test/database-url.guard';
import { AuditLogService } from '../audit/audit-log.service';
import { CreditService } from '../credit/credit.service';
import { OperationalReportService } from './operational-report.service';

describe.sequential(
  'Operational reporting real PostgreSQL, isolated evidence only',
  () => {
    const prisma = new PrismaService(),
      service = new OperationalReportService(prisma),
      credit = new CreditService(prisma, new AuditLogService(prisma));
    const run = randomUUID().replaceAll('-', '');
    let customerId = '',
      actorId = '';
    let connected = false;
    let command = 0;
    const context = () => ({
      actorId,
      requestId: `report-${run}`,
      idempotencyKey: `report-${run}-${command++}`,
    });
    const query = {
      from: '2026-01-01T00:00:00Z',
      toExclusive: '2026-01-02T00:00:00Z',
    };
    beforeAll(async () => {
      assertIsolatedTestDatabase({
        databaseUrl: process.env.DATABASE_URL,
        nodeEnvironment: process.env.NODE_ENV,
      });
      await prisma.$connect();
      connected = true;
      actorId = (
        await prisma.user.create({
          data: { email: `report-${run}@example.test`, status: 'ACTIVE' },
        })
      ).id;
      customerId = (
        await prisma.customer.create({
          data: {
            mobile: `+989${(BigInt(`0x${run}`) % 1000000000n).toString().padStart(9, '0')}`,
            firstName: 'Isolated report',
            lastName: 'Never live',
          },
        })
      ).id;
    });
    afterAll(async () => {
      if (!connected) return;
      assertIsolatedTestDatabase({
        databaseUrl: process.env.DATABASE_URL,
        nodeEnvironment: process.env.NODE_ENV,
      });
      await prisma.$executeRawUnsafe(
        'TRUNCATE "CreditRefundPayout", "CreditSaleReturnLine", "CreditSaleReturn", "CreditLedgerEntry", "CreditReceipt", "ReceivableDocument", "CreditCommandRecord", "CreditAccount"',
      );
      await prisma.order.deleteMany({ where: { customerId } });
      await prisma.auditLog.deleteMany({ where: { actorId } });
      await prisma.customer.delete({ where: { id: customerId } });
      await prisma.user.delete({ where: { id: actorId } });
      await prisma.$disconnect();
    });
    async function order(amount: bigint, at: string) {
      return prisma.order.create({
        data: {
          customerId,
          number: `RPT-${run}-${command++}`,
          status: 'DRAFT',
          subtotal: amount,
          grandTotal: amount,
          discount: 0n,
          shipping: 0n,
          addressSnapshot: { recipient: 'Isolated report buyer' },
          shippingMethod: 'pickup',
          shippingMethodTitle: 'Pickup',
          shippingPolicyRevision: 'isolated-report',
          pricePolicyRevision: 'isolated-report',
          reservationExpiresAt: new Date(at),
          createdAt: new Date(at),
        },
      });
    }
    it('empty source has no invented settlement, invoice, debt or valuation', async () => {
      const report = await service.summary({ ...query, customerId });
      for (const total of Object.values(report.totals))
        expect(total.amount.amount).toBe('0');
      expect(report.timeline).toEqual([]);
      expect(report.topItems).toEqual([]);
      expect(report.unavailable).toContain('AUTHORITATIVE_INVENTORY_VALUATION');
      expect(
        (await service.debtors({ asOf: '2026-01-02T00:00:00Z', customerId }))
          .count,
      ).toBe(0);
    });
    it('uses inclusive/exclusive boundaries, integer totals above JS precision, bounded pages and status filters', async () => {
      const amount = 9007199254740993n;
      await order(1n, '2025-12-31T23:59:59.999Z');
      await order(amount, query.from);
      await order(amount, '2026-01-01T23:59:59.999Z');
      await order(4n, query.toExclusive);
      const report = await service.summary({ ...query, customerId });
      expect(report.totals.createdOrderValue).toEqual({
        count: 2,
        amount: { amount: (amount * 2n).toString(), currency: 'IRR' },
      });
      expect(report.totals.providerSettlements.amount.amount).toBe('0');
      expect(report.orderStatuses).toHaveLength(1);
      const first = await service.orders({
          ...query,
          customerId,
          offset: '0',
          limit: '1',
        }),
        second = await service.orders({
          ...query,
          customerId,
          offset: '1',
          limit: '1',
        });
      expect(first.count).toBe(2);
      expect(first.items).toHaveLength(1);
      expect(second.items[0].id).not.toBe(first.items[0].id);
      expect(first.items[0].total.amount).toBe(amount.toString());
      expect(first.items[0]).toMatchObject({
        paymentAttempts: 0,
        providerSettled: { amount: '0' },
        gatewayRefunded: { amount: '0' },
        issuedInvoiceNumber: null,
      });
      expect(JSON.stringify(first)).not.toContain('Isolated report buyer');
      expect(
        (await service.orders({ ...query, customerId, status: 'PAID' })).count,
      ).toBe(0);
      expect(
        (await service.debtors({ asOf: '2026-01-02T00:00:00Z', customerId }))
          .count,
      ).toBe(0);
    });
    it('groups in Tehran calendar days and ISO Monday weeks, with real monthly aggregation', async () => {
      await order(10n, '2026-02-01T20:29:59Z');
      await order(20n, '2026-02-01T20:30:00Z');
      const range = {
        from: '2026-02-01T00:00:00Z',
        toExclusive: '2026-02-03T00:00:00Z',
        customerId,
      };
      expect(
        (await service.summary(range)).timeline.map((row) => [
          row.period,
          row.amount.amount,
        ]),
      ).toEqual([
        ['2026-02-01', '10'],
        ['2026-02-02', '20'],
      ]);
      expect(
        (await service.summary({ ...range, grain: 'week' })).timeline.map(
          (row) => row.period,
        ),
      ).toEqual(['2026-01-26', '2026-02-02']);
      expect(
        (await service.summary({ ...range, grain: 'month' })).timeline,
      ).toMatchObject([{ period: '2026-02-01', amount: { amount: '30' } }]);
    });
    it('derives debtor aging only from authoritative credit commands and never multiplies receipts', async () => {
      const policy = await credit.policy(
        customerId,
        {
          expectedVersion: null,
          status: 'SUSPENDED',
          creditLimit: '0',
          termsDays: 0,
        },
        context(),
      );
      const opening = await credit.opening(
        customerId,
        {
          expectedVersion: policy.account.version,
          amount: '9007199254740993',
          issuedAt: '2025-11-01T00:00:00Z',
          dueAt: '2025-12-01T00:00:00Z',
          sourceReference: `isolated-report-opening-${run}`,
        },
        context(),
      );
      const received = await credit.receipt(
        customerId,
        {
          expectedVersion: opening.account.version,
          amount: '300',
          method: 'BANK_TRANSFER',
          effectiveAt: '2025-12-15T00:00:00Z',
          evidenceReference: `isolated-report-receipt-${run}`,
          allocations: [{ documentId: opening.documentId!, amount: '300' }],
        },
        context(),
      );
      const atReceipt = await service.debtors({
        asOf: '2026-01-01T00:00:00Z',
        customerId,
      });
      expect(atReceipt.items[0]).toMatchObject({
        documents: 1,
        outstanding: { amount: '9007199254740693' },
        overdue31To60Days: { amount: '9007199254740693' },
        notDue: { amount: '0' },
        refundObligation: { amount: '0' },
      });
      const initial = await service.summary({
        from: '2025-12-15T00:00:00Z',
        toExclusive: '2025-12-16T00:00:00Z',
        customerId,
      });
      expect(initial.totals.netRecordedCreditReceipts.amount.amount).toBe(
        '300',
      );
      await credit.reverseReceipt(
        customerId,
        received.receiptId!,
        {
          expectedVersion: received.account.version,
          effectiveAt: '2026-01-01T12:00:00Z',
          evidenceReference: `isolated-report-reversal-${run}`,
          reason: 'Isolated evidence correction',
        },
        context(),
      );
      expect(
        (await service.debtors({ asOf: '2026-01-02T00:00:00Z', customerId }))
          .items[0].outstanding.amount,
      ).toBe('9007199254740993');
      const reversed = await service.summary({ ...query, customerId });
      expect(reversed.totals.netRecordedCreditReceipts.amount.amount).toBe(
        '-300',
      );
      expect(
        (
          await service.summary({
            from: '2025-12-01T00:00:00Z',
            toExclusive: '2026-01-02T00:00:00Z',
            customerId,
          })
        ).totals.netRecordedCreditReceipts.amount.amount,
      ).toBe('0');
      expect(
        (await service.debtors({ asOf: '2025-12-01T00:00:00Z', customerId }))
          .items[0].notDue.amount,
      ).toBe('9007199254740993');
    });
    it('uses the same original ledger after service restart and bounded customer-isolated pages', async () => {
      const original = await service.debtors({
        asOf: '2026-01-02T00:00:00Z',
        customerId,
      });
      const restarted = new OperationalReportService(prisma);
      const next = await restarted.debtors({
        asOf: '2026-01-02T00:00:00Z',
        customerId,
      });
      expect(next.items).toEqual(original.items);
      expect(
        (
          await restarted.debtors({
            asOf: '2026-01-02T00:00:00Z',
            customerId: 'nonexistent',
          })
        ).items,
      ).toEqual([]);
      expect(
        (
          await restarted.debtors({
            asOf: '2026-01-02T00:00:00Z',
            customerId,
            offset: '1',
            limit: '1',
          })
        ).items,
      ).toEqual([]);
    });
  },
);
