import {
  HttpException,
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  Money,
  OperationalReportQuery,
  OperationalReportSummary,
  ReportMetric,
  ReportOrderRow,
  DebtorReportRow,
  ReportGrain,
  OrderStatus,
  PaymentStatus,
} from '@iranyaragh/contracts';
import { PrismaService } from '../../database/prisma.service';
import { RedactedLogger } from '../../common/redacted-logger';
import {
  debtorRange,
  reportRange,
  reportOptions,
} from './operational-report.validation';
const money = (value: string | bigint): Money => ({
  amount: String(value),
  currency: 'IRR',
});
function count(value: string) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0)
    throw new Error('Invalid aggregate count');
  return number;
}
const metrics: ReportMetric[] = [
  'createdOrderValue',
  'providerSettlements',
  'recordedGatewayRefunds',
  'netRecordedCreditReceipts',
  'recordedCreditRefundPayouts',
  'issuedInvoiceValue',
];
function orderScope(query: OperationalReportQuery) {
  const customer = query.customerId
    ? Prisma.sql`AND o."customerId"=${query.customerId}`
    : Prisma.empty;
  const status = query.status
    ? Prisma.sql`AND o."status"::text=${query.status}`
    : Prisma.empty;
  const product = query.productId
    ? Prisma.sql`AND EXISTS(SELECT 1 FROM "OrderItem" i JOIN "ProductVariant" v ON v.id=i."variantId" WHERE i."orderId"=o.id AND v."productId"=${query.productId})`
    : Prisma.empty;
  return Prisma.sql`SELECT o.id,o.number,o."customerId",o.status,o."createdAt",o."grandTotal" FROM "Order" o WHERE true ${customer} ${status} ${product}`;
}
function settlementCte() {
  return Prisma.sql`SELECT p.id,p."orderId",p.amount,p."gatewayEnvironment",MIN(t."createdAt") AS at FROM "Payment" p JOIN scope o ON o.id=p."orderId" JOIN "PaymentTransition" t ON t."paymentId"=p.id AND t."to"::text='PAID' WHERE p."referenceId" IS NOT NULL GROUP BY p.id`;
}
@Injectable()
export class OperationalReportService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}
  async options(kind: 'customer' | 'product', search: string) {
    reportOptions({ kind, search });
    return this.snapshot(async (tx) => {
      if (kind === 'customer') {
        const rows = await tx.customer.findMany({
          where: search
            ? {
                OR: [
                  { firstName: { contains: search, mode: 'insensitive' } },
                  { lastName: { contains: search, mode: 'insensitive' } },
                ],
              }
            : {},
          select: { id: true, firstName: true, lastName: true },
          orderBy: { id: 'asc' },
          take: 25,
        });
        return {
          items: rows.map((row) => ({
            id: row.id,
            label:
              [row.firstName, row.lastName].filter(Boolean).join(' ') ||
              'مشتری بدون نام',
          })),
        };
      }
      const rows = await tx.product.findMany({
        where: search
          ? { name: { contains: search, mode: 'insensitive' } }
          : {},
        select: { id: true, name: true },
        orderBy: { id: 'asc' },
        take: 25,
      });
      return { items: rows.map((row) => ({ id: row.id, label: row.name })) };
    });
  }
  private async snapshot<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT set_config('statement_timeout','3000',true)`;
          return operation(tx);
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
          timeout: 10000,
          maxWait: 2000,
        },
      );
    } catch (error) {
      if (error instanceof HttpException) throw error;
      new RedactedLogger().event('error', {
        event: 'report.read.failed',
        outcome: 'failure',
        errorCode: 'REPORT_UNAVAILABLE',
      });
      throw new InternalServerErrorException({
        code: 'REPORT_UNAVAILABLE',
        message: 'Report snapshot could not be confirmed; retry the read.',
      });
    }
  }
  async summary(
    raw: Record<string, unknown>,
  ): Promise<OperationalReportSummary> {
    const query = reportRange(raw),
      generatedAt = new Date().toISOString();
    return this.snapshot(async (tx) => {
      const timeline = await tx.$queryRaw<
        {
          period: string;
          metric: ReportMetric;
          environment: string | null;
          count: string;
          amount: string;
        }[]
      >(Prisma.sql`
    WITH scope AS NOT MATERIALIZED (${orderScope(query.filters)}), settled AS (${settlementCte()}), events AS (
      SELECT 'createdOrderValue'::text AS metric,o."createdAt" AS at,o."grandTotal" AS amount,NULL::text AS environment FROM scope o
      UNION ALL SELECT 'providerSettlements',p.at,p.amount,p."gatewayEnvironment" FROM settled p
      UNION ALL SELECT 'recordedGatewayRefunds',r."createdAt",r.amount,p."gatewayEnvironment" FROM "Refund" r JOIN "Payment" p ON p.id=r."paymentId" JOIN scope o ON o.id=p."orderId"
      UNION ALL SELECT 'issuedInvoiceValue',d."issuedAt",d."grandTotal",NULL FROM "InvoiceDocument" d JOIN scope o ON o.id=d."orderId"
      UNION ALL SELECT 'netRecordedCreditReceipts',e."effectiveAt",-e.amount,NULL FROM "CreditLedgerEntry" e JOIN "CreditAccount" a ON a.id=e."accountId" JOIN "ReceivableDocument" d ON d.id=e."documentId"
        WHERE e.kind::text IN ('RECEIPT','RECEIPT_REVERSAL') ${query.filters.customerId ? Prisma.sql`AND a."customerId"=${query.filters.customerId}` : Prisma.empty}
        ${query.filters.productId || query.filters.status ? Prisma.sql`AND d."orderId" IN(SELECT id FROM scope)` : Prisma.empty}
      UNION ALL SELECT 'recordedCreditRefundPayouts',p."effectiveAt",p.amount,NULL FROM "CreditRefundPayout" p JOIN "CreditSaleReturn" r ON r.id=p."returnId" JOIN scope o ON o.id=r."orderId"
    ) SELECT to_char(date_trunc(${query.filters.grain as ReportGrain},at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Tehran'),'YYYY-MM-DD') AS period,metric,environment,COUNT(*)::text AS count,SUM(amount)::text AS amount
    FROM events WHERE at>=${query.from} AND at<${query.toExclusive} GROUP BY period,metric,environment ORDER BY period,metric,environment`);
      const statuses = await tx.$queryRaw<
        { status: OrderStatus; count: string; amount: string }[]
      >(
        Prisma.sql`WITH scope AS NOT MATERIALIZED (${orderScope(query.filters)}) SELECT status,COUNT(*)::text AS count,SUM("grandTotal")::text AS amount FROM scope WHERE "createdAt">=${query.from} AND "createdAt"<${query.toExclusive} GROUP BY status ORDER BY status`,
      );
      const attempts = await tx.$queryRaw<
        { status: PaymentStatus; count: string; amount: string }[]
      >(
        Prisma.sql`WITH scope AS NOT MATERIALIZED (${orderScope(query.filters)}) SELECT p.status,COUNT(*)::text AS count,SUM(p.amount)::text AS amount FROM "Payment" p JOIN scope o ON o.id=p."orderId" WHERE p."createdAt">=${query.from} AND p."createdAt"<${query.toExclusive} GROUP BY p.status ORDER BY p.status`,
      );
      const top = await tx.$queryRaw<
        { sku: string; title: string; quantity: string; amount: string }[]
      >(Prisma.sql`WITH scope AS NOT MATERIALIZED (${orderScope(query.filters)}), committed AS(SELECT t."orderId",MIN(t."createdAt") AS at FROM "OrderTransition" t JOIN scope o ON o.id=t."orderId" WHERE t."to"::text IN('PAID','CREDIT_APPROVED') GROUP BY t."orderId")
    SELECT i.sku,MIN(i.title) AS title,SUM(i.quantity)::text AS quantity,SUM(i.total)::text AS amount FROM "OrderItem" i JOIN committed c ON c."orderId"=i."orderId" WHERE c.at>=${query.from} AND c.at<${query.toExclusive} GROUP BY i.sku ORDER BY SUM(i.quantity) DESC,i.sku LIMIT 30`);
      const totals = Object.fromEntries(
        metrics.map((metric) => [metric, { count: 0, amount: money('0') }]),
      ) as OperationalReportSummary['totals'];
      for (const row of timeline) {
        totals[row.metric].count = count(
          (BigInt(totals[row.metric].count) + BigInt(row.count)).toString(),
        );
        totals[row.metric].amount = money(
          BigInt(totals[row.metric].amount.amount) + BigInt(row.amount),
        );
      }
      return {
        generatedAt,
        timezone: 'Asia/Tehran',
        filters: query.filters,
        productFilterScope: 'ORDERS_CONTAINING_PRODUCT',
        totals,
        timeline: timeline.map((row) => ({
          ...row,
          count: count(row.count),
          amount: money(row.amount),
        })),
        orderStatuses: statuses.map((row) => ({
          ...row,
          count: count(row.count),
          amount: money(row.amount),
        })),
        paymentAttemptStatuses: attempts.map((row) => ({
          ...row,
          count: count(row.count),
          amount: money(row.amount),
        })),
        topItems: top.map((row) => ({
          sku: row.sku,
          title: row.title,
          quantity: count(row.quantity),
          grossValue: money(row.amount),
        })),
        unavailable: [
          'CORRECTIVE_INVOICE_DOCUMENTS',
          'AUTHORITATIVE_INVENTORY_VALUATION',
          'PDF_AND_QUEUED_EXPORTS',
        ],
      };
    });
  }
  async orders(raw: Record<string, unknown>) {
    const query = reportRange(raw, true),
      generatedAt = new Date().toISOString();
    return this.snapshot(async (tx) => {
      const [{ total }] = await tx.$queryRaw<{ total: string }[]>(
        Prisma.sql`WITH scope AS NOT MATERIALIZED(${orderScope(query.filters)}) SELECT count(*)::text AS total FROM scope WHERE "createdAt">=${query.from} AND "createdAt"<${query.toExclusive}`,
      );
      const rows = await tx.$queryRaw<
        {
          id: string;
          number: string;
          customerId: string;
          status: OrderStatus;
          createdAt: Date;
          total: bigint;
          attempts: string;
          settled: string;
          refunded: string;
          invoice: string | null;
        }[]
      >(Prisma.sql`
    WITH scope AS NOT MATERIALIZED(${orderScope(query.filters)}), settled AS(${settlementCte()}), page AS(SELECT * FROM scope WHERE "createdAt">=${query.from} AND "createdAt"<${query.toExclusive} ORDER BY "createdAt" DESC,id DESC OFFSET ${query.offset} LIMIT ${query.limit})
    SELECT o.id,o.number,o."customerId",o.status,o."createdAt",o."grandTotal" AS total,(SELECT COUNT(*)::text FROM "Payment" p WHERE p."orderId"=o.id) AS attempts,
     COALESCE((SELECT SUM(s.amount)::text FROM settled s WHERE s."orderId"=o.id),'0') AS settled,
     COALESCE((SELECT SUM(r.amount)::text FROM "Refund" r JOIN "Payment" p ON p.id=r."paymentId" WHERE p."orderId"=o.id),'0') AS refunded,
     (SELECT d.number FROM "InvoiceDocument" d WHERE d."orderId"=o.id) AS invoice FROM page o ORDER BY o."createdAt" DESC,o.id DESC`);
      const items: ReportOrderRow[] = rows.map((row) => ({
        id: row.id,
        number: row.number,
        customerId: row.customerId,
        status: row.status,
        createdAt: row.createdAt.toISOString(),
        total: money(row.total),
        paymentAttempts: count(row.attempts),
        providerSettled: money(row.settled),
        gatewayRefunded: money(row.refunded),
        issuedInvoiceNumber: row.invoice,
      }));
      return {
        generatedAt,
        items,
        count: count(total),
        offset: query.offset,
        limit: query.limit,
      };
    });
  }
  async debtors(raw: Record<string, unknown>) {
    const query = debtorRange(raw),
      generatedAt = new Date().toISOString();
    return this.snapshot(async (tx) => {
      const base = Prisma.sql`WITH document_balances AS(SELECT d.id,d."accountId",d."dueAt",SUM(e.amount) AS outstanding FROM "ReceivableDocument" d JOIN "CreditLedgerEntry" e ON e."documentId"=d.id WHERE d."issuedAt"<=${query.asOf} AND e."effectiveAt"<=${query.asOf} GROUP BY d.id),
    payouts AS(SELECT "returnId",SUM(amount) AS amount FROM "CreditRefundPayout" WHERE "effectiveAt"<=${query.asOf} GROUP BY "returnId"),
    obligations AS(SELECT d."accountId",SUM(r."refundDue"-COALESCE(p.amount,0)) AS amount FROM "CreditSaleReturn" r JOIN "ReceivableDocument" d ON d.id=r."documentId" LEFT JOIN payouts p ON p."returnId"=r.id WHERE r."createdAt"<=${query.asOf} GROUP BY d."accountId"),
    accounts AS(SELECT a.id AS "accountId",a."customerId",a.status::text AS "accountStatus",COUNT(b.id) FILTER(WHERE b.outstanding>0)::text AS documents,
      COALESCE(SUM(b.outstanding),0)::text AS outstanding,COALESCE(SUM(b.outstanding) FILTER(WHERE b."dueAt">=${query.asOf}),0)::text AS "notDue",
      COALESCE(SUM(b.outstanding) FILTER(WHERE b."dueAt"<${query.asOf} AND b."dueAt">=${query.asOf}::timestamp-INTERVAL '30 days'),0)::text AS "overdueUpTo30Days",
      COALESCE(SUM(b.outstanding) FILTER(WHERE b."dueAt"<${query.asOf}::timestamp-INTERVAL '30 days' AND b."dueAt">=${query.asOf}::timestamp-INTERVAL '60 days'),0)::text AS "overdue31To60Days",
      COALESCE(SUM(b.outstanding) FILTER(WHERE b."dueAt"<${query.asOf}::timestamp-INTERVAL '60 days' AND b."dueAt">=${query.asOf}::timestamp-INTERVAL '90 days'),0)::text AS "overdue61To90Days",
      COALESCE(SUM(b.outstanding) FILTER(WHERE b."dueAt"<${query.asOf}::timestamp-INTERVAL '90 days'),0)::text AS "overdueOver90Days",COALESCE(o.amount,0)::text AS "refundObligation"
      FROM "CreditAccount" a LEFT JOIN document_balances b ON b."accountId"=a.id LEFT JOIN obligations o ON o."accountId"=a.id WHERE true ${query.customerId ? Prisma.sql`AND a."customerId"=${query.customerId}` : Prisma.empty}
      GROUP BY a.id,o.amount HAVING COALESCE(SUM(b.outstanding),0)>0 OR COALESCE(o.amount,0)>0)`;
      const [{ total }] = await tx.$queryRaw<{ total: string }[]>(
        Prisma.sql`${base} SELECT COUNT(*)::text AS total FROM accounts`,
      );
      const rows = await tx.$queryRaw<
        (Omit<
          DebtorReportRow,
          | 'documents'
          | 'outstanding'
          | 'notDue'
          | 'overdueUpTo30Days'
          | 'overdue31To60Days'
          | 'overdue61To90Days'
          | 'overdueOver90Days'
          | 'refundObligation'
        > & {
          documents: string;
          outstanding: string;
          notDue: string;
          overdueUpTo30Days: string;
          overdue31To60Days: string;
          overdue61To90Days: string;
          overdueOver90Days: string;
          refundObligation: string;
        })[]
      >(
        Prisma.sql`${base} SELECT * FROM accounts ORDER BY outstanding::numeric DESC,"accountId" OFFSET ${query.offset} LIMIT ${query.limit}`,
      );
      const items: DebtorReportRow[] = rows.map((row) => ({
        customerId: row.customerId,
        accountId: row.accountId,
        accountStatus: row.accountStatus,
        documents: count(row.documents),
        outstanding: money(row.outstanding),
        notDue: money(row.notDue),
        overdueUpTo30Days: money(row.overdueUpTo30Days),
        overdue31To60Days: money(row.overdue31To60Days),
        overdue61To90Days: money(row.overdue61To90Days),
        overdueOver90Days: money(row.overdueOver90Days),
        refundObligation: money(row.refundObligation),
      }));
      return {
        generatedAt,
        asOf: query.asOf.toISOString(),
        items,
        count: count(total),
        offset: query.offset,
        limit: query.limit,
      };
    });
  }
}
