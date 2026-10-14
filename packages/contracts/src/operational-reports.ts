import type { ApiSuccess, Money, OrderStatus, PaymentStatus } from './index';
export type ReportGrain = 'day' | 'week' | 'month';
export type OperationalReportQuery = {
  from: string;
  toExclusive: string;
  grain?: ReportGrain;
  customerId?: string;
  productId?: string;
  status?: OrderStatus;
};
export type ReportMetric =
  | 'createdOrderValue'
  | 'providerSettlements'
  | 'recordedGatewayRefunds'
  | 'netRecordedCreditReceipts'
  | 'recordedCreditRefundPayouts'
  | 'issuedInvoiceValue';
export type ReportValue = { count: number; amount: Money };
export type OperationalReportSummary = {
  generatedAt: string;
  timezone: 'Asia/Tehran';
  filters: OperationalReportQuery;
  productFilterScope: 'ORDERS_CONTAINING_PRODUCT';
  totals: Record<ReportMetric, ReportValue>;
  timeline: {
    period: string;
    metric: ReportMetric;
    environment: string | null;
    count: number;
    amount: Money;
  }[];
  orderStatuses: { status: OrderStatus; count: number; amount: Money }[];
  paymentAttemptStatuses: {
    status: PaymentStatus;
    count: number;
    amount: Money;
  }[];
  topItems: {
    sku: string;
    title: string;
    quantity: number;
    grossValue: Money;
  }[];
  unavailable: (
    | 'CORRECTIVE_INVOICE_DOCUMENTS'
    | 'AUTHORITATIVE_INVENTORY_VALUATION'
    | 'PDF_AND_QUEUED_EXPORTS'
  )[];
};
export type OperationalReportResponse = ApiSuccess<{
  report: OperationalReportSummary;
}>;
export type ReportOrdersQuery = Omit<OperationalReportQuery, 'grain'> & {
  offset?: number;
  limit?: number;
};
export type ReportOrderRow = {
  id: string;
  number: string;
  customerId: string;
  status: OrderStatus;
  createdAt: string;
  total: Money;
  paymentAttempts: number;
  providerSettled: Money;
  gatewayRefunded: Money;
  issuedInvoiceNumber: string | null;
};
export type ReportOrdersResponse = ApiSuccess<{
  generatedAt: string;
  items: ReportOrderRow[];
  count: number;
  offset: number;
  limit: number;
}>;
export type DebtorsReportQuery = {
  asOf: string;
  customerId?: string;
  offset?: number;
  limit?: number;
};
export type DebtorReportRow = {
  customerId: string;
  accountId: string;
  accountStatus: string;
  documents: number;
  outstanding: Money;
  notDue: Money;
  overdueUpTo30Days: Money;
  overdue31To60Days: Money;
  overdue61To90Days: Money;
  overdueOver90Days: Money;
  refundObligation: Money;
};
export type DebtorsReportResponse = ApiSuccess<{
  generatedAt: string;
  asOf: string;
  items: DebtorReportRow[];
  count: number;
  offset: number;
  limit: number;
}>;
