import type { ApiSuccess } from './index';
import type { OperationalReportQuery } from './operational-reports';
export type ReportExportOutputFormat = 'csv' | 'xlsx';
export type ReportExportRowBudget = { maxRows: number };
/**
 * Normalized snapshot definition. The same value (after canonical JSON
 * serialization) is hashed into the immutable job/artifact identity, so a
 * later live query cannot masquerade as a refresh of an earlier export.
 */
export type ReportExportDefinition = {
  kind: 'operations-summary' | 'orders' | 'debtors';
  filters?: OperationalReportQuery;
  debtors?: { asOf: string; customerId?: string };
  maxRows: number;
};
export type ReportExportRequestResult = {
  exportId: string;
  status: 'PENDING' | 'READY';
  sha256: string | null;
  byteCount: number | null;
  replayed: boolean;
};
export type ReportExportResponse = ApiSuccess<ReportExportRequestResult>;

/** Private table evidence for reconciling a page with its downloaded export. */
export type ReportExportSnapshotView = {
  exportId: string;
  definition: ReportExportDefinition;
  sha256: string;
  generatedAt: string;
  expiresAt: string;
  headers: string[];
  rows: string[][];
};
