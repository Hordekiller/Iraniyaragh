import { Inject, Injectable } from '@nestjs/common';
import type { ReportExportDefinition } from '@iranyaragh/contracts';
import type {
  OperationalReportSummary,
  DebtorReportRow,
  ReportOrderRow,
} from '@iranyaragh/contracts';
import { OperationalReportService } from './operational-report.service';

// Row tables are pure snapshots of already-approved report surfaces: counts and
// integer IRR amounts serialize as strings so CSV/XLSX stays exact.
export type ReportExportTable = { headers: string[]; rows: string[][] };
export type ReportExportRender = ReportExportTable & { generatedAt: string; truncated: boolean };

class ReportExportRenderUnavailable extends Error {
  readonly code = 'RENDER_FAILED';
}

@Injectable()
export class ReportExportRenderer {
  constructor(
    @Inject(OperationalReportService) private readonly reports: OperationalReportService,
  ) {}

  async render(definition: ReportExportDefinition): Promise<ReportExportRender> {
    try {
      if (definition.kind === 'debtors') {
        return await this.debtorsTable(definition);
      }
      if (definition.kind === 'orders') {
        return await this.ordersTable(definition);
      }
      return await this.summaryTable(definition);
    } catch (error) {
      if (error instanceof ReportExportRenderUnavailable) throw error;
      throw new ReportExportRenderUnavailable(
        error instanceof Error ? error.message : 'unavailable',
      );
    }
  }

  private async summaryTable(
    definition: ReportExportDefinition,
  ): Promise<ReportExportRender> {
    const filters = definition.filters;
    if (!filters) throw new ReportExportRenderUnavailable('filters required');
    const summary: OperationalReportSummary = await this.reports.summary({
      ...filters,
      grain: filters.grain ?? 'day',
    });
    const rows: string[][] = [];
    for (const row of summary.timeline) {
      rows.push([
        'timeline',
        row.period,
        row.metric,
        row.environment ?? '',
        String(row.count),
        row.amount.amount,
      ]);
    }
    for (const [metric, total] of Object.entries(summary.totals)) {
      rows.push([
        'totals',
        '',
        metric,
        '',
        String(total.count),
        total.amount.amount,
      ]);
    }
    for (const row of summary.orderStatuses) {
      rows.push([
        'order-statuses',
        '',
        row.status,
        '',
        String(row.count),
        row.amount.amount,
      ]);
    }
    for (const row of summary.paymentAttemptStatuses) {
      rows.push([
        'payment-attempts',
        '',
        row.status,
        '',
        String(row.count),
        row.amount.amount,
      ]);
    }
    for (const row of summary.topItems) {
      rows.push([
        'top-items',
        '',
        `${row.title} (${row.sku})`,
        '',
        String(row.quantity),
        row.grossValue.amount,
      ]);
    }
    return {
      headers: ['section', 'period', 'label', 'environment', 'count', 'amount'],
      rows,
      generatedAt: summary.generatedAt,
      truncated: false,
    };
  }

  private async ordersTable(
    definition: ReportExportDefinition,
  ): Promise<ReportExportRender> {
    const filters = definition.filters;
    if (!filters) throw new ReportExportRenderUnavailable('filters required');
    const report = await this.reports.ordersForExport(
      {
        customerId: filters.customerId,
        productId: filters.productId,
        status: filters.status,
      },
      new Date(filters.from),
      new Date(filters.toExclusive),
      definition.maxRows,
    );
    const rows: string[][] = report.items.map((row: ReportOrderRow) => [
      row.id,
      row.number,
      row.customerId,
      row.status,
      row.createdAt,
      row.total.amount,
      String(row.paymentAttempts),
      row.providerSettled.amount,
      row.gatewayRefunded.amount,
      row.issuedInvoiceNumber ?? '',
    ]);
    return {
      headers: [
        'id',
        'number',
        'customerId',
        'status',
        'createdAt',
        'grandTotal',
        'paymentAttempts',
        'providerSettled',
        'gatewayRefunded',
        'issuedInvoiceNumber',
      ],
      rows,
      generatedAt: report.generatedAt,
      truncated: report.count > rows.length,
    };
  }

  private async debtorsTable(
    definition: ReportExportDefinition,
  ): Promise<ReportExportRender> {
    const debtors = definition.debtors;
    if (!debtors) throw new ReportExportRenderUnavailable('debtors scope required');
    const report = await this.reports.debtorsForExport(
      {
        asOf: new Date(debtors.asOf),
        customerId: debtors.customerId,
      },
      definition.maxRows,
    );
    const rows: string[][] = report.items.map((row: DebtorReportRow) => [
      row.customerId,
      row.accountId,
      row.accountStatus,
      String(row.documents),
      row.outstanding.amount,
      row.notDue.amount,
      row.overdueUpTo30Days.amount,
      row.overdue31To60Days.amount,
      row.overdue61To90Days.amount,
      row.overdueOver90Days.amount,
      row.refundObligation.amount,
    ]);
    return {
      headers: [
        'customerId',
        'accountId',
        'accountStatus',
        'documents',
        'outstanding',
        'notDue',
        'overdueUpTo30Days',
        'overdue31To60Days',
        'overdue61To90Days',
        'overdueOver90Days',
        'refundObligation',
      ],
      rows,
      generatedAt: report.generatedAt,
      truncated: report.count > rows.length,
    };
  }
}
