import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserStatus } from '@prisma/client';
import type {
  AccessPermission,
  AccessRole,
  AccessRoleDetail,
  AccessRoleHistoryEntry,
  AccessRoleMember,
  AccessUser,
} from '@iranyaragh/contracts';
import { advisoryLockIdKey } from '../../common/advisory-lock';
import { maskIdentifier } from '../../common/masking';
import { retryDelayMs, sleep } from '../../common/retry';
import { PrismaService } from '../../database/prisma.service';
import { AuditLogService } from '../audit/audit-log.service';
import { AuthPermissionService } from '../auth/auth-permission.service';
import type {
  AccessMemberAssignDto,
  AccessMemberRevokeDto,
  AccessPermissionsReplaceDto,
  AccessRoleCreateDto,
  AccessRoleHistoryQueryDto,
  AccessRoleUpdateDto,
  AccessUserListQueryDto,
} from './access.dto';

const keyPattern = /^[A-Za-z0-9_-]{8,96}$/u;
const MAX_ACCESS_SCOPE = 160;
const MAX_ASSIGNMENT_MS = 366 * 24 * 60 * 60 * 1_000;
const sha256 = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');

type CommandContext = Readonly<{
  actorId: string;
  requestId: string | null;
  idempotencyKey: string;
}>;

type Transaction = Prisma.TransactionClient;

const roleInclude = {
  permissions: {
    where: { revokedAt: null },
    include: { permission: true },
  },
  users: {
    where: { revokedAt: null },
    include: {
      user: {
        select: {
          id: true,
          status: true,
          mobile: true,
          email: true,
          firstName: true,
          lastName: true,
        },
      },
    },
  },
} satisfies Prisma.RoleInclude;

type RoleWithAccess = Prisma.RoleGetPayload<{ include: typeof roleInclude }>;

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const object = value as Record<string, unknown>;
  const byCodeUnit = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  return `{${Object.keys(object)
    .sort(byCodeUnit)
    .map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`)
    .join(',')}}`;
}

const roleNotFound = () =>
  new NotFoundException({ code: 'ACCESS_NOT_FOUND', message: 'Role not found.' });
const userNotFound = () =>
  new NotFoundException({ code: 'ACCESS_NOT_FOUND', message: 'Staff user not found.' });
const roleExists = () =>
  new ConflictException({ code: 'ACCESS_ROLE_EXISTS', message: 'A role with this key already exists.' });
const stale = () =>
  new ConflictException({
    code: 'ACCESS_VERSION_CONFLICT',
    message: 'Access data changed; reload before editing.',
  });
const invalid = (message: string) =>
  new BadRequestException({ code: 'ACCESS_INPUT_INVALID', message });
const escalation = () =>
  new ForbiddenException({
    code: 'ACCESS_PRIVILEGE_ESCALATION',
    message: 'You cannot grant permissions or roles that exceed your own access.',
  });
const systemProtected = () =>
  new ForbiddenException({
    code: 'ACCESS_SYSTEM_ROLE_PROTECTED',
    message: 'A protected system role cannot be disabled or stripped of access administration.',
  });
const lastAdmin = () =>
  new ConflictException({
    code: 'ACCESS_LAST_ADMIN',
    message: 'At least one active user must keep the roles.manage permission.',
  });

const displayName = (firstName: string | null, lastName: string | null): string | null =>
  [firstName, lastName].filter(Boolean).join(' ') || null;

function maskedEmail(email: string | null): string | null {
  if (!email) return null;
  const [local, domain] = email.split('@');
  if (!domain) return maskIdentifier(email, 1, 0);
  return `${(local ?? '').slice(0, 1)}***@${domain}`;
}

const sortedKeys = (keys: Iterable<string>) => [...new Set(keys)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

@Injectable()
export class AccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    private readonly permissions: AuthPermissionService,
  ) {}

  async listRoles(): Promise<AccessRole[]> {
    const rows = await this.prisma.role.findMany({
      include: roleInclude,
      orderBy: [{ isSystem: 'desc' }, { key: 'asc' }],
    });
    const now = new Date();
    return rows.map((row) => this.summary(row, now));
  }

  async getRole(id: string): Promise<AccessRoleDetail> {
    const row = await this.prisma.role.findUnique({ where: { id }, include: roleInclude });
    if (!row) throw roleNotFound();
    return this.detail(row, new Date());
  }

  async listPermissions(): Promise<AccessPermission[]> {
    const rows = await this.prisma.permission.findMany({
      orderBy: [{ group: 'asc' }, { key: 'asc' }],
    });
    return rows.map((row) => this.permission(row));
  }

  async listUsers(query: AccessUserListQueryDto): Promise<{ items: AccessUser[]; total: number }> {
    const search = query.search?.trim();
    const where: Prisma.UserWhereInput = { deletedAt: null };
    if (search) {
      where.OR = [
        { mobile: { contains: search } },
        { email: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
      ];
    }
    const now = new Date();
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.perPage,
        take: query.perPage,
        select: {
          id: true,
          mobile: true,
          email: true,
          firstName: true,
          lastName: true,
          status: true,
          createdAt: true,
          roleAssignments: {
            where: {
              revokedAt: null,
              assignedAt: { lte: now },
              OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
              role: { isActive: true },
            },
            select: { role: { select: { key: true } } },
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      total,
      items: rows.map((row) => {
        const roleKeys = sortedKeys(row.roleAssignments.map((assignment) => assignment.role.key));
        return {
          id: row.id,
          displayName: displayName(row.firstName, row.lastName),
          mobileMasked: row.mobile ? maskIdentifier(row.mobile, 4, 4) : null,
          emailMasked: maskedEmail(row.email),
          status: row.status,
          roleKeys,
          isActiveAdmin: row.status === UserStatus.ACTIVE && roleKeys.includes('system-admin'),
          createdAt: row.createdAt.toISOString(),
        };
      }),
    };
  }

  async createRole(input: AccessRoleCreateDto, context: CommandContext): Promise<AccessRoleDetail> {
    const permissionKeys = sortedKeys(input.permissionKeys);
    return this.command('create', input, context, async (tx) => {
      await this.assertPermissionsExist(tx, permissionKeys);
      await this.assertActorCanGrant(tx, context.actorId, permissionKeys);
      const existing = await tx.role.findUnique({ where: { key: input.key }, select: { id: true } });
      if (existing) throw roleExists();

      const role = await tx.role.create({
        data: {
          key: input.key,
          name: input.name,
          description: input.description ?? null,
          isSystem: false,
          isActive: true,
        },
      });
      await this.grantPermissions(tx, role.id, permissionKeys, context.actorId);
      await this.audit.record(
        {
          actorId: context.actorId,
          requestId: context.requestId,
          action: 'access.role.created',
          entityType: 'Role',
          entityId: role.id,
          after: { key: role.key, name: role.name, isActive: role.isActive },
          metadata: { permissionKeys },
        },
        tx,
      );
      return this.detail(await this.roleRow(tx, role.id), new Date());
    });
  }

  async updateRole(id: string, input: AccessRoleUpdateDto, context: CommandContext): Promise<AccessRoleDetail> {
    return this.command(`role:${id}:update`, input, context, async (tx) => {
      const role = await tx.role.findUnique({ where: { id } });
      if (!role) throw roleNotFound();
      if (input.isActive === false && role.isSystem) throw systemProtected();

      const result = await tx.role.updateMany({
        where: { id, version: input.expectedVersion },
        data: {
          version: { increment: 1 },
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        },
      });
      if (result.count === 0) throw stale();

      await this.audit.record(
        {
          actorId: context.actorId,
          requestId: context.requestId,
          action: 'access.role.updated',
          entityType: 'Role',
          entityId: id,
          before: { name: role.name, description: role.description, isActive: role.isActive },
          after: {
            name: input.name ?? role.name,
            description: input.description === undefined ? role.description : input.description,
            isActive: input.isActive ?? role.isActive,
          },
        },
        tx,
      );
      await this.assertAdminRemains(tx);
      return this.detail(await this.roleRow(tx, id), new Date());
    });
  }

  async replacePermissions(
    id: string,
    input: AccessPermissionsReplaceDto,
    context: CommandContext,
  ): Promise<AccessRoleDetail> {
    const requestedKeys = sortedKeys(input.permissionKeys);
    return this.command(`role:${id}:permissions`, input, context, async (tx) => {
      const role = await tx.role.findUnique({
        where: { id },
        include: {
          permissions: {
            where: { revokedAt: null },
            include: { permission: { select: { id: true, key: true } } },
          },
        },
      });
      if (!role) throw roleNotFound();
      if (role.key === 'system-admin' && !requestedKeys.includes('roles.manage')) throw systemProtected();

      await this.assertPermissionsExist(tx, requestedKeys);
      await this.assertActorCanGrant(tx, context.actorId, requestedKeys);

      const current = new Map(role.permissions.map((grant) => [grant.permission.key, grant]));
      const desired = new Set(requestedKeys);
      const removed = role.permissions.filter((grant) => !desired.has(grant.permission.key));
      const added = requestedKeys.filter((key) => !current.has(key));

      const result = await tx.role.updateMany({
        where: { id, version: input.expectedVersion },
        data: { version: { increment: 1 } },
      });
      if (result.count === 0) throw stale();

      if (removed.length) {
        await tx.rolePermission.updateMany({
          where: { id: { in: removed.map((grant) => grant.id) } },
          data: { revokedAt: new Date(), revokedById: context.actorId, revokeReason: 'Access administration' },
        });
      }
      if (added.length) {
        const permissions = await tx.permission.findMany({
          where: { key: { in: added }, isActive: true },
          select: { id: true, key: true },
        });
        for (const permission of permissions) {
          await this.grantPermission(tx, id, permission.id, context.actorId);
        }
      }

      const beforeKeys = sortedKeys(current.keys());
      await this.audit.record(
        {
          actorId: context.actorId,
          requestId: context.requestId,
          action: 'access.role.permissions.replaced',
          entityType: 'Role',
          entityId: id,
          before: { permissionKeys: beforeKeys },
          after: { permissionKeys: requestedKeys },
        },
        tx,
      );
      await this.assertAdminRemains(tx);
      return this.detail(await this.roleRow(tx, id), new Date());
    });
  }

  async assignMember(
    id: string,
    input: AccessMemberAssignDto,
    context: CommandContext,
  ): Promise<AccessRoleDetail> {
    return this.command(`role:${id}:assign`, input, context, async (tx) => {
      const now = new Date();
      const role = await tx.role.findUnique({
        where: { id },
        include: {
          permissions: { where: { revokedAt: null }, select: { permission: { select: { key: true, isActive: true } } } },
        },
      });
      if (!role) throw roleNotFound();
      if (!role.isActive) throw invalid('An inactive role cannot be assigned.');
      await this.assertActorCanGrant(
        tx,
        context.actorId,
        role.permissions.filter((grant) => grant.permission.isActive).map((grant) => grant.permission.key),
      );

      const user = await tx.user.findUnique({
        where: { id: input.userId },
        select: { id: true, status: true, deletedAt: true },
      });
      if (!user || user.deletedAt) throw userNotFound();
      if (user.status !== UserStatus.ACTIVE) throw invalid('Only an active staff user can receive a role.');

      const expiresAt = this.assignmentExpiry(input.expiresAt, now);
      const existing = await tx.userRole.findUnique({
        where: { userId_roleId: { userId: user.id, roleId: id } },
      });
      const currentlyAssigned =
        existing !== null &&
        existing.revokedAt === null &&
        (existing.expiresAt === null || existing.expiresAt > now);
      if (currentlyAssigned) throw invalid('This role is already assigned to the user.');

      const result = await tx.role.updateMany({
        where: { id, version: input.expectedVersion },
        data: { version: { increment: 1 } },
      });
      if (result.count === 0) throw stale();

      if (existing) {
        await tx.userRole.update({
          where: { id: existing.id },
          data: {
            assignedAt: now,
            assignedById: context.actorId,
            expiresAt,
            revokedAt: null,
            revokedById: null,
            revokeReason: null,
          },
        });
      } else {
        await tx.userRole.create({
          data: {
            userId: user.id,
            roleId: id,
            assignedById: context.actorId,
            assignedAt: now,
            expiresAt,
          },
        });
      }

      await this.audit.record(
        {
          actorId: context.actorId,
          requestId: context.requestId,
          action: 'access.role.member.assigned',
          entityType: 'Role',
          entityId: id,
          metadata: { userId: user.id, expiresAt: expiresAt?.toISOString() ?? null },
        },
        tx,
      );
      await this.assertAdminRemains(tx);
      return this.detail(await this.roleRow(tx, id), now);
    });
  }

  async revokeMember(
    id: string,
    userId: string,
    input: AccessMemberRevokeDto,
    context: CommandContext,
  ): Promise<AccessRoleDetail> {
    return this.command(`role:${id}:revoke:${userId}`, input, context, async (tx) => {
      const role = await tx.role.findUnique({ where: { id }, select: { id: true } });
      if (!role) throw roleNotFound();
      const assignment = await tx.userRole.findUnique({
        where: { userId_roleId: { userId, roleId: id } },
      });
      if (!assignment || assignment.revokedAt !== null) throw roleNotFound();

      const result = await tx.role.updateMany({
        where: { id, version: input.expectedVersion },
        data: { version: { increment: 1 } },
      });
      if (result.count === 0) throw stale();

      await tx.userRole.update({
        where: { id: assignment.id },
        data: {
          revokedAt: new Date(),
          revokedById: context.actorId,
          revokeReason: input.reason ?? 'Access administration',
        },
      });

      await this.audit.record(
        {
          actorId: context.actorId,
          requestId: context.requestId,
          action: 'access.role.member.revoked',
          entityType: 'Role',
          entityId: id,
          metadata: { userId, reason: input.reason ?? null },
        },
        tx,
      );
      await this.assertAdminRemains(tx);
      return this.detail(await this.roleRow(tx, id), new Date());
    });
  }

  async history(
    id: string,
    query: AccessRoleHistoryQueryDto,
  ): Promise<{ items: AccessRoleHistoryEntry[]; total: number }> {
    const role = await this.prisma.role.findUnique({ where: { id }, select: { id: true } });
    if (!role) throw roleNotFound();
    const where: Prisma.AuditLogWhereInput = {
      entityType: 'Role',
      entityId: id,
      action: { startsWith: 'access.role.' },
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.perPage,
        take: query.perPage,
        include: { actor: { select: { id: true, firstName: true, lastName: true } } },
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return {
      total,
      items: rows.map((row) => ({
        id: row.id,
        action: row.action,
        actorId: row.actorId,
        actorLabel: row.actor ? displayName(row.actor.firstName, row.actor.lastName) ?? row.actor.id : null,
        metadata: row.metadata,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }

  private async command<T>(
    scope: string,
    payload: unknown,
    context: CommandContext,
    execute: (tx: Transaction) => Promise<T>,
  ): Promise<T> {
    if (!keyPattern.test(context.idempotencyKey ?? '')) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Idempotency-Key must contain 8-96 ASCII letters, digits, underscores or hyphens.',
      });
    }
    if (scope.length > MAX_ACCESS_SCOPE) throw invalid('Access command identifier is too long.');

    const keyHash = sha256(context.idempotencyKey);
    const requestHash = sha256(stableJson(payload));
    const key = { actorId: context.actorId, scope, keyHash };
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            const [hi, lo] = advisoryLockIdKey('access-command', context.actorId, scope, keyHash);
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(${hi}::int, ${lo}::int)`;
            const prior = await tx.accessCommandRecord.findUnique({ where: { actorId_scope_keyHash: key } });
            if (prior) {
              if (prior.requestHash !== requestHash) {
                throw new ConflictException({
                  code: 'ACCESS_IDEMPOTENCY_CONFLICT',
                  message: 'Key reused with another access command.',
                });
              }
              return prior.response as T;
            }
            const record = await tx.accessCommandRecord.create({
              data: { ...key, requestHash, response: {} },
            });
            const result = await execute(tx);
            await tx.accessCommandRecord.update({
              where: { id: record.id },
              data: { response: result as Prisma.InputJsonValue },
            });
            return result;
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
          if (attempt < 3) {
            await sleep(retryDelayMs(attempt));
            continue;
          }
          throw new ConflictException({
            code: 'RETRYABLE_CONFLICT',
            message: 'Concurrent access command; retry with the same idempotency key.',
          });
        }
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw roleExists();
        }
        throw error;
      }
    }
    throw new ConflictException({ code: 'RETRYABLE_CONFLICT', message: 'Access command could not be committed.' });
  }

  private async assertPermissionsExist(tx: Transaction, keys: string[]): Promise<void> {
    if (!keys.length) return;
    const rows = await tx.permission.findMany({
      where: { key: { in: keys }, isActive: true },
      select: { key: true },
    });
    if (rows.length !== keys.length) {
      const found = new Set(rows.map((row) => row.key));
      throw invalid(`Unknown or inactive permissions: ${keys.filter((key) => !found.has(key)).join(', ')}.`);
    }
  }

  private async assertActorCanGrant(tx: Transaction, actorId: string, keys: string[]): Promise<void> {
    if (!keys.length) return;
    const effective = await this.permissions.effectivePermissionKeys(actorId, new Date(), tx);
    if (keys.some((key) => !effective.has(key))) throw escalation();
  }

  private async assertAdminRemains(tx: Transaction): Promise<void> {
    const now = new Date();
    const count = await tx.userRole.count({
      where: {
        revokedAt: null,
        assignedAt: { lte: now },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        user: { status: UserStatus.ACTIVE, deletedAt: null },
        role: {
          isActive: true,
          permissions: {
            some: {
              revokedAt: null,
              grantedAt: { lte: now },
              permission: { key: 'roles.manage', isActive: true },
            },
          },
        },
      },
    });
    if (count === 0) throw lastAdmin();
  }

  private async grantPermissions(
    tx: Transaction,
    roleId: string,
    keys: string[],
    actorId: string,
  ): Promise<void> {
    if (!keys.length) return;
    const permissions = await tx.permission.findMany({
      where: { key: { in: keys }, isActive: true },
      select: { id: true },
    });
    for (const permission of permissions) {
      await this.grantPermission(tx, roleId, permission.id, actorId);
    }
  }

  private async grantPermission(
    tx: Transaction,
    roleId: string,
    permissionId: string,
    actorId: string,
  ): Promise<void> {
    const existing = await tx.rolePermission.findUnique({
      where: { roleId_permissionId: { roleId, permissionId } },
    });
    if (existing) {
      await tx.rolePermission.update({
        where: { id: existing.id },
        data: {
          revokedAt: null,
          revokedById: null,
          revokeReason: null,
          grantedAt: new Date(),
          grantedById: actorId,
        },
      });
      return;
    }
    await tx.rolePermission.create({ data: { roleId, permissionId, grantedById: actorId } });
  }

  private assignmentExpiry(raw: string | null | undefined, now: Date): Date | null {
    if (!raw) return null;
    const expiresAt = new Date(raw);
    if (!Number.isFinite(expiresAt.getTime()) || expiresAt <= now) {
      throw invalid('expiresAt must be a future timestamp.');
    }
    if (expiresAt.getTime() - now.getTime() > MAX_ASSIGNMENT_MS) {
      throw invalid('expiresAt cannot be more than one year ahead.');
    }
    return expiresAt;
  }

  private async roleRow(tx: Transaction, id: string): Promise<RoleWithAccess> {
    const row = await tx.role.findUnique({ where: { id }, include: roleInclude });
    if (!row) throw roleNotFound();
    return row;
  }

  private summary(row: RoleWithAccess, now: Date): AccessRole {
    const activeMembers = row.users.filter(
      (assignment) =>
        assignment.user.status === UserStatus.ACTIVE &&
        (assignment.expiresAt === null || assignment.expiresAt > now),
    );
    return {
      id: row.id,
      key: row.key,
      name: row.name,
      description: row.description,
      isSystem: row.isSystem,
      isActive: row.isActive,
      version: row.version,
      permissionKeys: sortedKeys(row.permissions.map((grant) => grant.permission.key)),
      memberCount: row.users.length,
      activeMemberCount: activeMembers.length,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private detail(row: RoleWithAccess, now: Date): AccessRoleDetail {
    const permissions = row.permissions
      .map((grant) => grant.permission)
      .sort((a, b) =>
        a.group === b.group ? (a.key < b.key ? -1 : 1) : a.group < b.group ? -1 : 1,
      )
      .map((permission) => this.permission(permission));
    const members: AccessRoleMember[] = row.users
      .map((assignment) => ({
        userId: assignment.user.id,
        displayName: displayName(assignment.user.firstName, assignment.user.lastName),
        mobileMasked: assignment.user.mobile ? maskIdentifier(assignment.user.mobile, 4, 4) : null,
        emailMasked: maskedEmail(assignment.user.email),
        status: assignment.user.status,
        assignedAt: assignment.assignedAt.toISOString(),
        expiresAt: assignment.expiresAt?.toISOString() ?? null,
        assignmentExpired: assignment.expiresAt !== null && assignment.expiresAt <= now,
      }))
      .sort((a, b) => (a.assignedAt < b.assignedAt ? 1 : -1));
    return { ...this.summary(row, now), permissions, members };
  }

  private permission(row: {
    key: string;
    name: string;
    description: string | null;
    group: string;
    isActive: boolean;
  }): AccessPermission {
    return {
      key: row.key,
      name: row.name,
      description: row.description ?? '',
      group: row.group,
      isActive: row.isActive,
    };
  }
}
