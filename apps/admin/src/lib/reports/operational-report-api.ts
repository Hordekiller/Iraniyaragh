import type {
  OperationalReportQuery,
  OperationalReportResponse,
  ReportOrdersResponse,
  DebtorsReportResponse,
  DebtorsReportQuery,
} from '@iranyaragh/contracts';
import { apiFetch } from '@/lib/api/client';
import { getAccessToken } from '@/lib/auth/token-store';
const root = '/reports/admin/operations';
function params(query: object) {
  const result = new URLSearchParams();
  for (const [key, value] of Object.entries(query))
    if (value !== undefined && value !== '') result.set(key, String(value));
  return result.toString();
}
export async function readOperationalReport(
  query: OperationalReportQuery,
  signal: AbortSignal,
) {
  return (
    await apiFetch<OperationalReportResponse['data']>(
      `${root}?${params(query)}`,
      { token: getAccessToken(), signal },
    )
  ).data.report;
}
export async function readReportOrders(
  query: OperationalReportQuery,
  offset: number,
  signal: AbortSignal,
) {
  const { grain: unused, ...filters } = query;
  void unused;
  return (
    await apiFetch<ReportOrdersResponse['data']>(
      `${root}/orders?${params({ ...filters, offset, limit: 25 })}`,
      { token: getAccessToken(), signal },
    )
  ).data;
}
export async function readReportDebtors(
  query: DebtorsReportQuery,
  signal: AbortSignal,
) {
  return (
    await apiFetch<DebtorsReportResponse['data']>(
      `${root}/debtors?${params({ ...query, limit: 25 })}`,
      { token: getAccessToken(), signal },
    )
  ).data;
}
export async function readReportOptions(
  kind: 'customer' | 'product',
  search: string,
  signal: AbortSignal,
) {
  return (
    await apiFetch<{ items: { id: string; label: string }[] }>(
      `${root}/options?${params({ kind, search })}`,
      { token: getAccessToken(), signal },
    )
  ).data.items;
}
