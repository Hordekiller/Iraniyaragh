import type { AuditLogFilters, AuditLogListResponse } from '@iranyaragh/contracts';
import { apiFetch } from '@/lib/api/client';
import { getAccessToken } from '@/lib/auth/token-store';

export function queryString(query: AuditLogFilters): string {
  const params = new URLSearchParams();
  if (query.offset !== undefined) params.set('offset', String(query.offset));
  if (query.limit !== undefined) params.set('limit', String(query.limit));
  if (query.action?.trim()) params.set('action', query.action.trim());
  if (query.entityType) params.set('entityType', query.entityType);
  if (query.entityId?.trim()) params.set('entityId', query.entityId.trim());
  if (query.actorId?.trim()) params.set('actorId', query.actorId.trim());
  if (query.createdFrom) params.set('createdFrom', query.createdFrom);
  if (query.createdToExclusive) params.set('createdToExclusive', query.createdToExclusive);
  return params.toString();
}

export async function listAuditLogs(query: AuditLogFilters, signal?: AbortSignal): Promise<AuditLogListResponse> {
  return apiFetch<AuditLogListResponse>(`/audit/admin/logs?${queryString(query)}`, {
    token: getAccessToken(), signal, responseShape: 'raw',
  });
}