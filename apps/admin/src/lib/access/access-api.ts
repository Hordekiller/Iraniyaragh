import type {
  AccessMemberAssignRequest,
  AccessMemberRevokeRequest,
  AccessPermissionsReplaceRequest,
  AccessPermissionListResponse,
  AccessRoleCreateRequest,
  AccessRoleDetailResponse,
  AccessRoleHistoryResponse,
  AccessRoleListResponse,
  AccessRoleUpdateRequest,
  AccessUserListResponse,
} from '@iranyaragh/contracts';
import { apiFetch } from '@/lib/api/client';
import { getAccessToken } from '@/lib/auth/token-store';

export function newAccessCommandKey(command: string): string {
  return `access-${command}-${globalThis.crypto.randomUUID()}`;
}

export async function listAccessRoles(signal?: AbortSignal): Promise<AccessRoleListResponse['data']> {
  const response = await apiFetch<AccessRoleListResponse['data']>('/access/admin/roles', {
    token: getAccessToken(),
    signal,
  });
  return response.data;
}

export async function getAccessRole(id: string, signal?: AbortSignal): Promise<AccessRoleDetailResponse['data']['role']> {
  const response = await apiFetch<AccessRoleDetailResponse['data']>(
    `/access/admin/roles/${encodeURIComponent(id)}`,
    { token: getAccessToken(), signal },
  );
  return response.data.role;
}

export async function listAccessPermissions(signal?: AbortSignal): Promise<AccessPermissionListResponse['data']> {
  const response = await apiFetch<AccessPermissionListResponse['data']>('/access/admin/permissions', {
    token: getAccessToken(),
    signal,
  });
  return response.data;
}

export async function listAccessUsers(
  params: { search?: string; page?: number; perPage?: number },
  signal?: AbortSignal,
): Promise<AccessUserListResponse['data']> {
  const query = new URLSearchParams();
  if (params.search?.trim()) query.set('search', params.search.trim());
  if (params.page) query.set('page', String(params.page));
  if (params.perPage) query.set('perPage', String(params.perPage));
  const serialized = query.toString();
  const response = await apiFetch<AccessUserListResponse['data']>(
    `/access/admin/users${serialized ? `?${serialized}` : ''}`,
    { token: getAccessToken(), signal },
  );
  return response.data;
}

export async function listAccessRoleHistory(
  id: string,
  page = 1,
  perPage = 10,
  signal?: AbortSignal,
): Promise<AccessRoleHistoryResponse['data']> {
  const response = await apiFetch<AccessRoleHistoryResponse['data']>(
    `/access/admin/roles/${encodeURIComponent(id)}/history?page=${page}&perPage=${perPage}`,
    { token: getAccessToken(), signal },
  );
  return response.data;
}

export async function createAccessRole(
  input: AccessRoleCreateRequest,
  idempotencyKey: string,
): Promise<AccessRoleDetailResponse['data']['role']> {
  const response = await apiFetch<AccessRoleDetailResponse['data']>('/access/admin/roles', {
    method: 'POST',
    token: getAccessToken(),
    body: input,
    headers: { 'Idempotency-Key': idempotencyKey },
  });
  return response.data.role;
}

export async function updateAccessRole(
  id: string,
  input: AccessRoleUpdateRequest,
  idempotencyKey: string,
): Promise<AccessRoleDetailResponse['data']['role']> {
  const response = await apiFetch<AccessRoleDetailResponse['data']>(
    `/access/admin/roles/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      token: getAccessToken(),
      body: input,
      headers: { 'Idempotency-Key': idempotencyKey },
    },
  );
  return response.data.role;
}

export async function replaceAccessPermissions(
  id: string,
  input: AccessPermissionsReplaceRequest,
  idempotencyKey: string,
): Promise<AccessRoleDetailResponse['data']['role']> {
  const response = await apiFetch<AccessRoleDetailResponse['data']>(
    `/access/admin/roles/${encodeURIComponent(id)}/permissions`,
    {
      method: 'PUT',
      token: getAccessToken(),
      body: input,
      headers: { 'Idempotency-Key': idempotencyKey },
    },
  );
  return response.data.role;
}

export async function assignAccessMember(
  id: string,
  input: AccessMemberAssignRequest,
  idempotencyKey: string,
): Promise<AccessRoleDetailResponse['data']['role']> {
  const response = await apiFetch<AccessRoleDetailResponse['data']>(
    `/access/admin/roles/${encodeURIComponent(id)}/members`,
    {
      method: 'POST',
      token: getAccessToken(),
      body: input,
      headers: { 'Idempotency-Key': idempotencyKey },
    },
  );
  return response.data.role;
}

export async function revokeAccessMember(
  id: string,
  userId: string,
  input: AccessMemberRevokeRequest,
  idempotencyKey: string,
): Promise<AccessRoleDetailResponse['data']['role']> {
  const response = await apiFetch<AccessRoleDetailResponse['data']>(
    `/access/admin/roles/${encodeURIComponent(id)}/members/${encodeURIComponent(userId)}/revoke`,
    {
      method: 'POST',
      token: getAccessToken(),
      body: input,
      headers: { 'Idempotency-Key': idempotencyKey },
    },
  );
  return response.data.role;
}
