import type { ApiSuccess } from './index';

/**
 * Admin RBAC API contracts (ADR-0014, G2). These views are the public contract
 * for the staff directory, role/permission registry and role-assignment
 * management; they never expose Prisma models directly.
 */

export type RbacUserStatus = 'ACTIVE' | 'PENDING' | 'SUSPENDED' | 'LOCKED' | 'DELETED';

export type RbacStaffSummary = {
  userId: string;
  email: string | null;
  mobile: string | null;
  name: string;
  status: RbacUserStatus;
  activeRoleCount: number;
  createdAt: string;
};

/**
 * A single role-assignment row for one user (active or revoked), including the
 * optional expiry and the revoke reason when revoked.
 */
export type RbacAssignmentView = {
  assignmentId: string;
  roleId: string;
  roleKey: string;
  roleName: string;
  roleDescription: string | null;
  isSystem: boolean;
  assignedAt: string;
  assignedById: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  revokeReason: string | null;
};

export type RbacStaffDetail = RbacStaffSummary & {
  /** Role assignments that are currently active (not revoked and within their expiry). */
  activeGrants: RbacAssignmentView[];
  /** Union of granted permission keys across the active grants. */
  effectivePermissionKeys: string[];
};

export type RbacRoleView = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  isActive: boolean;
  /** Currently granted, non-revoked, active permission keys of this role. */
  permissionKeys: string[];
  createdAt: string;
  updatedAt: string;
};

export type RbacPermissionView = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  group: string;
  isActive: boolean;
};

/** A static separation-of-duty set: at most one of `permissionKeys` may be held. */
export type RbacSoDRestrictionView = {
  id: string;
  key: string;
  name: string;
  description: string;
  permissionKeys: string[];
  isActive: boolean;
};

export type RbacStaffDirectoryResponse = ApiSuccess<{
  items: RbacStaffSummary[];
  total: number;
  cursor: string | null;
}>;

export type RbacStaffDetailResponse = ApiSuccess<{ staff: RbacStaffDetail }>;

export type RbacRolesResponse = ApiSuccess<{ items: RbacRoleView[] }>;

export type RbacRoleResponse = ApiSuccess<{ role: RbacRoleView }>;

export type RbacPermissionsResponse = ApiSuccess<{ items: RbacPermissionView[] }>;

export type RbacPermissionResponse = ApiSuccess<{ permission: RbacPermissionView }>;

export type RbacSoDRestrictionsResponse = ApiSuccess<{ items: RbacSoDRestrictionView[] }>;

export type RbacRoleCreateRequest = {
  /** Lowercase slug used as the unique role key (e.g. `warehouse-manager`). */
  key: string;
  name: string;
  description?: string;
};

export type RbacRoleUpdateRequest = {
  name?: string;
  description?: string;
  isActive?: boolean;
  /**
   * Explicit confirmation required to *activate* a suspended (deactivated)
   * role; ensures reactivation is a deliberate decision per ADR-0014 §4.1.5.
   */
  explicitSignal?: boolean;
};

export type RbacPermissionToggleRequest = {
  isActive: boolean;
};

export type RbacGrantRoleRequest = {
  roleId: string;
  /** Optional ISO-8601 expiry for the assignment (time-boxed elevation). */
  expiresAt?: string;
  reason?: string;
};

export type RbacRevokeRoleRequest = {
  revokeReason: string;
};

export type RbacGrantRoleResponse = ApiSuccess<{ assignment: RbacAssignmentView }>;

export type RbacRevokeRoleResponse = ApiSuccess<{
  /** The assignment row after the operation; `null` when the assignment never existed (idempotent no-op). */
  assignment: RbacAssignmentView | null;
  /** `true` when a previously active assignment was revoked by this call. */
  changed: boolean;
}>;

/** Impact preview (ADR-0014 §4.1.6): who and what a role deactivation changes. */
export type RbacRoleImpactResponse = ApiSuccess<{
  role: {
    roleId: string;
    roleKey: string;
    name: string;
    isSystem: boolean;
  };
  deactivation: {
    totalActiveAssignments: number;
    users: Array<{
      userId: string;
      name: string;
      /** Effective keys this user would lose if the role were deactivated. */
      lostPermissionKeys: string[];
    }>;
  };
}>;