import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import type {
  RbacAssignmentView,
  RbacGrantRoleResponse,
  RbacPermissionResponse,
  RbacPermissionsResponse,
  RbacRevokeRoleResponse,
  RbacRoleImpactResponse,
  RbacRoleResponse,
  RbacRolesResponse,
  RbacSoDRestrictionsResponse,
  RbacStaffDetailResponse,
  RbacStaffDirectoryResponse,
} from '@iranyaragh/contracts';
import { PrismaService } from '../../database/prisma.service';
import { AuditLogService } from '../audit/audit-log.service';
import { AuthPermissionService } from '../auth/auth-permission.service';

type ActorAndRequest = { actorUserId: string; requestId: string };
type AssignmentRow = {
  id: string;
  roleId: string;
  assignedById: string | null;
  assignedAt: Date;
  expiresAt: Date | null;
  revokedAt: Date | null;
  revokeReason: string | null;
  role: { key: string; name: string; description: string | null; isSystem: boolean };
};

const SYSTEM_ADMIN_ROLE_KEY = 'system-admin';

@Injectable()
export class RbacAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    private readonly permissions: AuthPermissionService,
  ) {}

  async listStaff(query: {
    search?: string;
    roleKey?: string;
    status?: UserStatus;
    limit?: number;
    cursor?: string;
  }): Promise<RbacStaffDirectoryResponse> {
    const now = new Date();
    const limit = query.limit ?? 50;
    const where: Record<string, unknown> = { deletedAt: null };
    if (query.status) where.status = query.status;
    if (query.roleKey) {
      where.roleAssignments = {
        some: {
          revokedAt: null,
          role: { key: query.roleKey, isActive: true },
        },
      };
    }
    if (query.cursor) {
      const cursorUser = await this.prisma.user.findUnique({ where: { id: query.cursor }, select: { createdAt: true, id: true } });
      if (!cursorUser) throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'The staff page cursor is not valid.' });
      where.OR = [
        { createdAt: { lt: cursorUser.createdAt } },
        { createdAt: cursorUser.createdAt, id: { lt: cursorUser.id } },
      ];
    }
    if (query.search) {
      where.AND = [
        {
          OR: [
            { firstName: { contains: query.search, mode: 'insensitive' } },
            { lastName: { contains: query.search, mode: 'insensitive' } },
            { email: { contains: query.search, mode: 'insensitive' } },
            { mobile: { contains: query.search, mode: 'insensitive' } },
          ],
        },
      ];
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
        select: {
          id: true,
          email: true,
          mobile: true,
          firstName: true,
          lastName: true,
          status: true,
          createdAt: true,
          roleAssignments: {
            where: {
              revokedAt: null,
              role: { isActive: true },
              OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
            },
            select: { id: true },
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    const hasMore = users.length > limit;
    const page = hasMore ? users.slice(0, limit) : users;
    const last = page[page.length - 1];

    return {
      data: {
        items: page.map((user) => ({
          userId: user.id,
          email: user.email,
          mobile: user.mobile,
          name: [user.firstName, user.lastName].filter(Boolean).join(' ') || 'Unnamed',
          status: user.status,
          activeRoleCount: user.roleAssignments.length,
          createdAt: user.createdAt.toISOString(),
        })),
        total,
        cursor: hasMore && last ? last.id : null,
      },
    };
  }

  async getStaffDetail(userId: string): Promise<RbacStaffDetailResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        mobile: true,
        firstName: true,
        lastName: true,
        status: true,
        createdAt: true,
        roleAssignments: {
          orderBy: { assignedAt: 'desc' },
          select: {
            id: true,
            roleId: true,
            assignedById: true,
            assignedAt: true,
            expiresAt: true,
            revokedAt: true,
            revokeReason: true,
            role: { select: { key: true, name: true, description: true, isSystem: true } },
          },
        },
      },
    });
    if (!user || user.status === UserStatus.DELETED) {
      throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'The staff member is not available.' });
    }

    const effectivePermissionKeys = await this.permissions.effectivePermissionKeys(user.id);

    return {
      data: {
        staff: {
          userId: user.id,
          email: user.email,
          mobile: user.mobile,
          name: [user.firstName, user.lastName].filter(Boolean).join(' ') || 'Unnamed',
          status: user.status,
          activeRoleCount: user.roleAssignments.filter((grant) => grant.revokedAt === null).length,
          createdAt: user.createdAt.toISOString(),
          activeGrants: user.roleAssignments
            .filter((grant) => grant.revokedAt === null)
            .map((grant) => this.toAssignmentView(grant)),
          effectivePermissionKeys: [...effectivePermissionKeys],
        },
      },
    };
  }

  async listRoles(): Promise<RbacRolesResponse> {
    const roles = await this.prisma.role.findMany({
      orderBy: [{ isSystem: 'desc' }, { key: 'asc' }],
      include: {
        permissions: {
          where: { revokedAt: null },
          select: { permission: { select: { key: true, isActive: true } } },
        },
      },
    });

    return {
      data: {
        items: roles.map((role) => ({
          id: role.id,
          key: role.key,
          name: role.name,
          description: role.description,
          isSystem: role.isSystem,
          isActive: role.isActive,
          permissionKeys: role.permissions
            .filter((grant) => grant.permission.isActive)
            .map((grant) => grant.permission.key)
            .sort(),
          createdAt: role.createdAt.toISOString(),
          updatedAt: role.updatedAt.toISOString(),
        })),
      },
    };
  }

  async getRole(roleId: string): Promise<RbacRoleResponse> {
    const role = await this.prisma.role.findUnique({
      where: { id: roleId },
      include: { permissions: { where: { revokedAt: null }, select: { permission: { select: { key: true, isActive: true } } } } },
    });
    if (!role) throw new NotFoundException({ code: 'ROLE_NOT_FOUND', message: 'The role is not available.' });
    return { data: { role: this.toRoleView(role) } };
  }

  async createRole(
    ctx: ActorAndRequest,
    input: { key: string; name: string; description?: string | null },
  ): Promise<RbacRoleResponse> {
    await this.audit.record(this.baseRecord(ctx, 'rbac.role.create.attempt', { entityId: null, after: { key: input.key } }));

    const existing = await this.prisma.role.findUnique({ where: { key: input.key } });
    if (existing) {
      throw new ConflictException({ code: 'CONFLICT', message: `A role with key '${input.key}' already exists.` });
    }

    const role = await this.prisma.role.create({
      data: {
        key: input.key,
        name: input.name,
        description: input.description ?? null,
        isSystem: false,
        isActive: true,
      },
      include: { permissions: { where: { revokedAt: null }, select: { permission: { select: { key: true, isActive: true } } } } },
    });

    await this.audit.record(this.baseRecord(ctx, 'rbac.role.created', { entityId: role.id, after: { key: role.key, name: role.name } }));
    return { data: { role: this.toRoleView(role) } };
  }

  async updateRole(
    ctx: ActorAndRequest,
    roleId: string,
    input: { name?: string; description?: string | null; isActive?: boolean; explicitSignal?: boolean },
  ): Promise<RbacRoleResponse> {
    const role = await this.prisma.role.findUnique({
      where: { id: roleId },
      include: { permissions: { where: { revokedAt: null }, select: { permission: { select: { key: true, isActive: true } } } } },
    });
    if (!role) throw new NotFoundException({ code: 'ROLE_NOT_FOUND', message: 'The role is not available.' });

    const changingDefinition = (input.name !== undefined || input.description !== undefined) && role.isSystem;
    if (changingDefinition) {
      throw new UnprocessableEntityException({
        code: 'ROLE_IS_SYSTEM_READONLY',
        message: 'Definitions of system roles are read-only.',
      });
    }

    const reactivating = input.isActive === true && !role.isActive;
    if (reactivating && input.explicitSignal !== true) {
      throw new UnprocessableEntityException({
        code: 'EXPLICIT_SIGNAL_REQUIRED',
        message: 'Reactivating a suspended role requires an explicit signal.',
      });
    }

    const deactivating = input.isActive === false && role.isActive;
    await this.audit.record(
      this.baseRecord(ctx, 'rbac.role.update.attempt', {
        entityId: role.id,
        before: { key: role.key, isActive: role.isActive, name: role.name },
      }),
    );

    const before = { key: role.key, isActive: role.isActive, name: role.name };
    if (deactivating) {
      await this.assertNotLastSystemAdminAfterDeactivation(role.key, role.isSystem);
    }

    const updated = await this.prisma.role.update({
      where: { id: roleId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
      include: { permissions: { where: { revokedAt: null }, select: { permission: { select: { key: true, isActive: true } } } } },
    });

    await this.audit.record(
      this.baseRecord(ctx, 'rbac.role.updated', {
        entityId: updated.id,
        before,
        after: { key: updated.key, isActive: updated.isActive, name: updated.name },
      }),
    );
    return { data: { role: this.toRoleView(updated) } };
  }

  async listPermissions(): Promise<RbacPermissionsResponse> {
    const permissions = await this.prisma.permission.findMany({ orderBy: [{ group: 'asc' }, { key: 'asc' }] });
    return {
      data: {
        items: permissions.map((permission) => ({
          id: permission.id,
          key: permission.key,
          name: permission.name,
          description: permission.description,
          group: permission.group,
          isActive: permission.isActive,
        })),
      },
    };
  }

  async togglePermission(
    ctx: ActorAndRequest,
    permissionId: string,
    input: { isActive: boolean },
  ): Promise<RbacPermissionResponse> {
    const permission = await this.prisma.permission.findUnique({ where: { id: permissionId } });
    if (!permission) throw new NotFoundException({ code: 'CONFLICT', message: 'The permission is not available.' });

    await this.audit.record(
      this.baseRecord(ctx, 'rbac.permission.toggled', {
        entityId: permission.id,
        before: { key: permission.key, isActive: permission.isActive },
        after: { key: permission.key, isActive: input.isActive },
      }),
    );

    const updated = await this.prisma.permission.update({
      where: { id: permissionId },
      data: { isActive: input.isActive },
    });

    return {
      data: {
        permission: {
          id: updated.id,
          key: updated.key,
          name: updated.name,
          description: updated.description,
          group: updated.group,
          isActive: updated.isActive,
        },
      },
    };
  }

  async listSoDRestrictions(): Promise<RbacSoDRestrictionsResponse> {
    const restrictions = await this.prisma.soDRestriction.findMany({ orderBy: [{ isActive: 'desc' }, { key: 'asc' }] });
    return {
      data: {
        items: restrictions.map((restriction) => ({
          id: restriction.id,
          key: restriction.key,
          name: restriction.name,
          description: restriction.description,
          permissionKeys: restriction.permissionKeys,
          isActive: restriction.isActive,
        })),
      },
    };
  }

  async grantRole(
    ctx: ActorAndRequest,
    userId: string,
    input: { roleId: string; expiresAt?: string; reason?: string },
  ): Promise<RbacGrantRoleResponse> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, status: true } });
    if (!user || user.status === UserStatus.DELETED) {
      throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'The staff member is not available.' });
    }

    const role = await this.prisma.role.findUnique({
      where: { id: input.roleId },
      include: { permissions: { where: { revokedAt: null }, select: { permission: { select: { key: true, isActive: true } } } } },
    });
    if (!role) throw new NotFoundException({ code: 'ROLE_NOT_FOUND', message: 'The role is not available.' });
    if (!role.isActive) {
      throw new ConflictException({ code: 'CONFLICT', message: 'A suspended role cannot be granted until it is reactivated.' });
    }

    const parsed = parseExpiry(input.expiresAt);
    const now = new Date();
    const roleKeys = new Set(
      role.permissions.filter((grant) => grant.permission.isActive).map((grant) => grant.permission.key),
    );
    await this.assertNotSoDViolation(userId, roleKeys, now);

    await this.audit.record(
      this.baseRecord(ctx, 'rbac.grant.attempt', {
        entityId: userId,
        before: { roleKey: role.key, reason: input.reason ?? null },
      }),
    );

    const existing = await this.prisma.userRole.findUnique({
      where: { userId_roleId: { userId, roleId: role.id } },
      select: { id: true, revokedAt: true, expiresAt: true },
    });

    let assignment: AssignmentRow;
    if (existing && existing.revokedAt === null) {
      const needsExpiryUpdate = parsed.expiresAt && parsed.expiresAt.getTime() !== existing.expiresAt?.getTime();
      assignment = await this.prisma.userRole.update({
        where: { userId_roleId: { userId, roleId: role.id } },
        data: needsExpiryUpdate ? { expiresAt: parsed.expiresAt } : {},
        include: { role: { select: { key: true, name: true, description: true, isSystem: true } } },
      });
    } else if (existing) {
      assignment = await this.prisma.userRole.update({
        where: { userId_roleId: { userId, roleId: role.id } },
        data: {
          revokedAt: null,
          revokedById: null,
          revokeReason: null,
          assignedById: ctx.actorUserId,
          assignedAt: now,
          ...(parsed.expiresAt ? { expiresAt: parsed.expiresAt } : {}),
        },
        include: { role: { select: { key: true, name: true, description: true, isSystem: true } } },
      });
    } else {
      assignment = await this.prisma.userRole.create({
        data: {
          userId,
          roleId: role.id,
          assignedById: ctx.actorUserId,
          assignedAt: now,
          ...(parsed.expiresAt ? { expiresAt: parsed.expiresAt } : {}),
        },
        include: { role: { select: { key: true, name: true, description: true, isSystem: true } } },
      });
    }

    await this.audit.record(
      this.baseRecord(ctx, 'rbac.grant.granted', {
        entityId: userId,
        after: {
          roleKey: role.key,
          assignmentId: assignment.id,
          expiresAt: assignment.expiresAt?.toISOString() ?? null,
          reason: input.reason ?? null,
        },
      }),
    );

    return { data: { assignment: this.toAssignmentView(assignment, true) } };
  }

  async revokeRole(
    ctx: ActorAndRequest,
    userId: string,
    roleId: string,
    input: { revokeReason: string },
  ): Promise<RbacRevokeRoleResponse> {
    const grant = await this.prisma.userRole.findUnique({
      where: { userId_roleId: { userId, roleId } },
      include: { role: { select: { key: true, name: true, description: true, isSystem: true } } },
    });
    if (!grant) {
      return { data: { assignment: null, changed: false } };
    }
    if (grant.revokedAt !== null) {
      return { data: { assignment: this.toAssignmentView(grant), changed: false } };
    }

    await this.assertNotLastSystemAdminDemotion(userId, roleId);
    const now = new Date();
    await this.audit.record(
      this.baseRecord(ctx, 'rbac.revoke.attempt', {
        entityId: userId,
        before: { roleKey: grant.role.key, revokeReason: input.revokeReason },
      }),
    );

    const revoked = await this.prisma.userRole.update({
      where: { userId_roleId: { userId, roleId } },
      data: { revokedAt: now, revokedById: ctx.actorUserId, revokeReason: input.revokeReason },
      include: { role: { select: { key: true, name: true, description: true, isSystem: true } } },
    });

    await this.audit.record(
      this.baseRecord(ctx, 'rbac.revoke.revoked', {
        entityId: userId,
        after: { roleKey: revoked.role.key, assignmentId: revoked.id, revokeReason: input.revokeReason },
      }),
    );

    return { data: { assignment: this.toAssignmentView(revoked), changed: true } };
  }

  async previewRoleDeactivation(roleId: string): Promise<RbacRoleImpactResponse> {
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role) throw new NotFoundException({ code: 'ROLE_NOT_FOUND', message: 'The role is not available.' });

    const now = new Date();
    const roleKeys = await this.rolePermissionKeys(roleId);
    const holders = await this.prisma.userRole.findMany({
      where: {
        roleId,
        revokedAt: null,
        role: { isActive: true },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        user: { status: { not: UserStatus.DELETED }, deletedAt: null },
      },
      select: {
        id: true,
        userId: true,
        expiresAt: true,
        user: { select: { firstName: true, lastName: true } },
      },
    });

    const users = [];
    for (const holder of holders) {
      const effective = await this.permissions.effectivePermissionKeys(holder.userId, now);
      users.push({
        userId: holder.userId,
        name: [holder.user.firstName, holder.user.lastName].filter(Boolean).join(' ') || 'Unnamed',
        lostPermissionKeys: [...roleKeys].filter((key) => effective.has(key)).sort(),
      });
    }

    return {
      data: {
        role: { roleId: role.id, roleKey: role.key, name: role.name, isSystem: role.isSystem },
        deactivation: { totalActiveAssignments: holders.length, users },
      },
    };
  }

  private async rolePermissionKeys(roleId: string): Promise<ReadonlySet<string>> {
    const grants = await this.prisma.rolePermission.findMany({
      where: { roleId, revokedAt: null },
      select: { permission: { select: { key: true, isActive: true } } },
    });
    return new Set(grants.filter((grant) => grant.permission.isActive).map((grant) => grant.permission.key));
  }

  private async assertNotSoDViolation(userId: string, incomingKeys: ReadonlySet<string>, now: Date): Promise<void> {
    const restrictions = await this.prisma.soDRestriction.findMany({ where: { isActive: true } });
    if (restrictions.length === 0) return;

    const current = await this.permissions.effectivePermissionKeys(userId, now);
    const resulting = new Set([...current, ...incomingKeys]);

    for (const restriction of restrictions) {
      const conflicts = restriction.permissionKeys.filter((key) => resulting.has(key));
      if (conflicts.length > 1) {
        throw new ConflictException({
          code: 'SOD_VIOLATION',
          message: `This assignment is blocked by separation-of-duty set '${restriction.name}' (${conflicts.join(', ')}). A single user may not hold those capabilities together.`,
        });
      }
    }
  }

  private async assertNotLastSystemAdminDemotion(userId: string, roleId: string): Promise<void> {
    const holders = await this.prisma.userRole.findMany({
      where: {
        role: { key: SYSTEM_ADMIN_ROLE_KEY, isActive: true },
        revokedAt: null,
        user: { status: UserStatus.ACTIVE, deletedAt: null },
      },
      select: { userId: true, roleId: true },
    });
    const thisGrantIsSystemAdmin = holders.some((holder) => holder.userId === userId && holder.roleId === roleId);
    if (thisGrantIsSystemAdmin && holders.length === 1) {
      throw new ConflictException({
        code: 'LAST_ADMIN_DEMOTION',
        message: 'This revoke would leave no active system administrator. The last active system-admin cannot be demoted.',
      });
    }
  }

  private async assertNotLastSystemAdminAfterDeactivation(roleKey: string, isSystem: boolean): Promise<void> {
    if (!isSystem || roleKey !== SYSTEM_ADMIN_ROLE_KEY) return;
    const activeHolders = await this.prisma.userRole.count({
      where: {
        role: { key: SYSTEM_ADMIN_ROLE_KEY, isActive: true },
        revokedAt: null,
        user: { status: UserStatus.ACTIVE, deletedAt: null },
      },
    });
    if (activeHolders > 0) {
      throw new ConflictException({
        code: 'LAST_ADMIN_DEMOTION',
        message: 'The system-admin role is currently held by active staff and cannot be deactivated.',
      });
    }
  }

  private toAssignmentView(grant: AssignmentRow, activeOnly = false): RbacAssignmentView {
    return {
      assignmentId: grant.id,
      roleId: grant.roleId,
      roleKey: grant.role.key,
      roleName: grant.role.name,
      roleDescription: grant.role.description,
      isSystem: grant.role.isSystem,
      assignedAt: grant.assignedAt.toISOString(),
      assignedById: grant.assignedById,
      expiresAt: grant.expiresAt?.toISOString() ?? null,
      revokedAt: activeOnly ? null : grant.revokedAt?.toISOString() ?? null,
      revokeReason: activeOnly ? null : grant.revokeReason,
    };
  }

  private toRoleView(role: {
    id: string;
    key: string;
    name: string;
    description: string | null;
    isSystem: boolean;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
    permissions: Array<{ permission: { key: string; isActive: boolean } }>;
  }): RbacRoleResponse['data']['role'] {
    return {
      id: role.id,
      key: role.key,
      name: role.name,
      description: role.description,
      isSystem: role.isSystem,
      isActive: role.isActive,
      permissionKeys: role.permissions
        .filter((grant) => grant.permission.isActive)
        .map((grant) => grant.permission.key)
        .sort(),
      createdAt: role.createdAt.toISOString(),
      updatedAt: role.updatedAt.toISOString(),
    };
  }

  private baseRecord(
    ctx: ActorAndRequest,
    action: string,
    extra: { entityId?: string | null; before?: Record<string, unknown>; after?: Record<string, unknown> } = {},
  ): Parameters<AuditLogService['record']>[0] {
    return {
      actorId: ctx.actorUserId,
      action,
      entityType: 'Role',
      entityId: extra.entityId ?? null,
      requestId: ctx.requestId,
      ...(extra.before ? { before: extra.before as never } : {}),
      ...(extra.after ? { after: extra.after as never } : {}),
    };
  }
}

function parseExpiry(expiresAt?: string): { expiresAt: Date | null } {
  if (!expiresAt) return { expiresAt: null };
  const parsed = new Date(expiresAt);
  if (Number.isNaN(parsed.getTime())) {
    throw new UnprocessableEntityException({ code: 'INVALID_REQUEST', message: 'expiresAt must be a valid ISO-8601 timestamp.' });
  }
  if (parsed.getTime() <= Date.now()) {
    throw new UnprocessableEntityException({ code: 'GRANT_EXPIRY_IN_PAST', message: 'expiresAt must be in the future.' });
  }
  return { expiresAt: parsed };
}