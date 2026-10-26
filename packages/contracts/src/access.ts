import type { ApiSuccess } from './api';

/**
 * Runtime role/permission administration contracts.
 *
 * Role membership and permission grants are historical facts: revoking writes a
 * revocation row instead of deleting evidence. Role shape includes the optimistic
 * version every mutation must echo back.
 */
export type AccessPermission = {
  key: string;
  name: string;
  description: string;
  group: string;
  isActive: boolean;
};

export type AccessRole = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  isActive: boolean;
  version: number;
  permissionKeys: string[];
  memberCount: number;
  activeMemberCount: number;
  createdAt: string;
  updatedAt: string;
};

export type AccessRoleMember = {
  userId: string;
  displayName: string | null;
  mobileMasked: string | null;
  emailMasked: string | null;
  status: 'ACTIVE' | 'PENDING' | 'SUSPENDED' | 'LOCKED' | 'DELETED';
  assignedAt: string;
  expiresAt: string | null;
  assignmentExpired: boolean;
};

export type AccessRoleDetail = AccessRole & {
  permissions: AccessPermission[];
  members: AccessRoleMember[];
};

export type AccessUser = {
  id: string;
  displayName: string | null;
  mobileMasked: string | null;
  emailMasked: string | null;
  status: 'ACTIVE' | 'PENDING' | 'SUSPENDED' | 'LOCKED' | 'DELETED';
  roleKeys: string[];
  isActiveAdmin: boolean;
  createdAt: string;
};

export type AccessRoleHistoryEntry = {
  id: string;
  action: string;
  actorId: string | null;
  actorLabel: string | null;
  metadata: unknown;
  createdAt: string;
};

export type AccessRoleListResponse = ApiSuccess<{ items: AccessRole[] }>;
export type AccessRoleDetailResponse = ApiSuccess<{ role: AccessRoleDetail }>;
export type AccessPermissionListResponse = ApiSuccess<{ items: AccessPermission[] }>;
export type AccessUserListResponse = ApiSuccess<{
  items: AccessUser[];
  meta: { page: number; perPage: number; total: number; pages: number };
}>;
export type AccessRoleHistoryResponse = ApiSuccess<{
  items: AccessRoleHistoryEntry[];
  total: number;
}>;

export type AccessRoleCreateRequest = {
  key: string;
  name: string;
  description?: string | null;
  permissionKeys: string[];
};

export type AccessRoleUpdateRequest = {
  expectedVersion: number;
  name?: string;
  description?: string | null;
  isActive?: boolean;
};

export type AccessPermissionsReplaceRequest = {
  expectedVersion: number;
  permissionKeys: string[];
};

export type AccessMemberAssignRequest = {
  expectedVersion: number;
  userId: string;
  expiresAt?: string | null;
};

export type AccessMemberRevokeRequest = {
  expectedVersion: number;
  reason?: string | null;
};

export const ACCESS_PERMISSION_GROUPS = [
  'catalog',
  'pricing',
  'inventory',
  'suppliers',
  'purchasing',
  'stocktake',
  'orders',
  'shipments',
  'payments',
  'invoices',
  'credit',
  'customers',
  'users',
  'roles',
  'reports',
  'audit',
  'settings',
] as const;

export type AccessPermissionGroup = (typeof ACCESS_PERMISSION_GROUPS)[number];
