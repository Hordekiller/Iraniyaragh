import type {
  AdminDashboardQuery,
  AdminDashboardResponse,
  AdminDashboardSummary,
} from '@iranyaragh/contracts';
import { apiFetch } from '@/lib/api/client';
import { getAccessToken } from '@/lib/auth/token-store';

function toQuery(query: AdminDashboardQuery): string {
  const params = new URLSearchParams({
    createdFrom: query.createdFrom,
    createdToExclusive: query.createdToExclusive,
  });
  return `?${params.toString()}`;
}

export async function getDashboardSummary(
  query: AdminDashboardQuery,
  signal?: AbortSignal,
): Promise<AdminDashboardSummary> {
  const response = await apiFetch<AdminDashboardResponse['data']>(
    `/reports/admin/dashboard${toQuery(query)}`,
    { token: getAccessToken(), signal },
  );
  return response.data.summary;
}

export const dashboardApi = { getSummary: getDashboardSummary };
