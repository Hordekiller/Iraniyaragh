import type {
  ReportExportDefinition,
  ReportExportOutputFormat,
  ReportExportRequestResult,
  ReportExportSnapshotView,
} from '@iranyaragh/contracts';
import { apiFetch } from '@/lib/api/client';
import { getAccessToken } from '@/lib/auth/token-store';

const root = '/reports/admin/exports';

export async function requestReportExport(
  definition: ReportExportDefinition,
  format: ReportExportOutputFormat,
  idempotencyKey: string,
): Promise<ReportExportRequestResult> {
  const response = await apiFetch<ReportExportRequestResult>(
    root,
    {
      method: 'POST',
      token: getAccessToken(),
      body: { definition, format },
      headers: { 'Idempotency-Key': idempotencyKey },
    },
  );
  return response.data;
}

export async function getReportExportStatus(exportId: string): Promise<ReportExportRequestResult> {
  const response = await apiFetch<ReportExportRequestResult>(
    `${root}/${encodeURIComponent(exportId)}`,
    { token: getAccessToken() },
  );
  return response.data;
}

export async function getReportExportSnapshot(exportId: string): Promise<ReportExportSnapshotView> {
  const response = await apiFetch<ReportExportSnapshotView>(
    `${root}/${encodeURIComponent(exportId)}/snapshot`,
    { token: getAccessToken() },
  );
  return response.data;
}

export async function downloadReportExport(exportId: string): Promise<Blob> {
  const baseUrl = (process.env.NEXT_PUBLIC_API_BASE_URL ?? '').replace(/\/$/, '');
  const token = getAccessToken();
  const res = await fetch(`${baseUrl}/api/v1${root}/${encodeURIComponent(exportId)}/artifact`, {
    method: 'GET',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`download failed: ${res.status}`);
  return res.blob();
}
