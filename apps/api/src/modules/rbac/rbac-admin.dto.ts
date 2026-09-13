import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { RbacUserStatus } from '@iranyaragh/contracts';

const ROLE_KEY = /^[a-z][a-z0-9-]{0,99}$/u;
const USER_STATUSES: RbacUserStatus[] = ['ACTIVE', 'PENDING', 'SUSPENDED', 'LOCKED', 'DELETED'];
/* eslint-disable-next-line no-control-regex */
const NO_CONTROL = new RegExp('^[^\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F]*$', 'u');

export class RbacStaffDirectoryQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Matches(NO_CONTROL)
  @ApiPropertyOptional({ description: 'Free-text search over name, mobile and email.', example: 'ali' })
  search!: string;

  @IsOptional()
  @IsString()
  @Matches(ROLE_KEY)
  @MaxLength(100)
  @ApiPropertyOptional({ description: 'Only staff holding an active grant of this role key.', example: 'system-admin' })
  roleKey!: string;

  @IsOptional()
  @IsString()
  @IsIn(USER_STATUSES)
  @ApiPropertyOptional({ description: 'Only staff in this user status.', enum: USER_STATUSES, example: 'ACTIVE' })
  status!: RbacUserStatus;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  @ApiPropertyOptional({ description: 'Maximum number of staff to return.', minimum: 1, maximum: 200, example: 50 })
  limit!: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  @ApiPropertyOptional({ description: 'Opaque cursor for the next page.', example: 'user_9aBcDeF' })
  cursor!: string;
}

export class RbacStaffPathDto {
  @IsString()
  @MaxLength(40)
  @ApiProperty({ description: 'Target user id (staff member).', example: 'user_9aBcDeF' })
  userId!: string;
}

export class RbacRolePathDto {
  @IsString()
  @MaxLength(40)
  @ApiProperty({ description: 'Target role id.', example: 'role_9aBcDeF' })
  roleId!: string;
}

export class RbacRevokeRolePathDto extends RbacStaffPathDto {
  @IsString()
  @MaxLength(40)
  @ApiProperty({ description: 'Id of the role assignment to revoke.', example: 'role_9aBcDeF' })
  roleId!: string;
}

export class RbacPermissionPathDto {
  @IsString()
  @MaxLength(40)
  @ApiProperty({ description: 'Target permission id.', example: 'perm_9aBcDeF' })
  permissionId!: string;
}

export class RbacRoleCreateDto {
  @IsString()
  @Matches(ROLE_KEY)
  @MaxLength(100)
  @ApiProperty({ description: 'Lowercase role key used for grants and guards.', pattern: String(ROLE_KEY), example: 'warehouse-manager' })
  key!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(150)
  @Matches(NO_CONTROL)
  @ApiProperty({ description: 'Human-readable role name.', example: 'Warehouse Manager' })
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  @Matches(NO_CONTROL)
  @ApiPropertyOptional({ description: 'What this role is for.', example: 'Daily stock receipt and adjustment.' })
  description!: string | null;
}

export class RbacRoleUpdateDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  @Matches(NO_CONTROL)
  @ApiPropertyOptional({ description: 'New human-readable role name.' })
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  @Matches(NO_CONTROL)
  @ApiPropertyOptional({ description: 'New role description.' })
  description!: string | null;

  @IsOptional()
  @IsBoolean()
  @ApiPropertyOptional({ description: 'Activate or deactivate the role.' })
  isActive!: boolean;

  @IsOptional()
  @IsBoolean()
  @ApiPropertyOptional({
    description: 'Explicit signal required when re-activating a suspended role (ADR-0014 §4.1.5).',
  })
  explicitSignal!: boolean;
}

export class RbacPermissionToggleDto {
  @IsBoolean()
  @ApiProperty({ description: 'Enable or disable this permission in the single registry.' })
  isActive!: boolean;
}

export class RbacGrantRoleDto {
  @IsString()
  @MaxLength(40)
  @ApiProperty({ description: 'Id of the role to grant to the staff member.', example: 'role_9aBcDeF' })
  roleId!: string;

  @IsOptional()
  @IsISO8601()
  @ApiPropertyOptional({
    description: 'Optional ISO-8601 expiry for the assignment (time-boxed elevation).',
    example: '2026-10-13T00:00:00.000Z',
  })
  expiresAt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Matches(NO_CONTROL)
  @ApiPropertyOptional({ description: 'Why the role is being granted (recorded in the audit trail).', example: 'Weekend manager cover.' })
  reason!: string;
}

export class RbacRevokeRoleDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  @Matches(NO_CONTROL)
  @ApiProperty({ description: 'Why the role is being revoked (recorded in the audit trail).', example: 'Cover period ended.' })
  revokeReason!: string;
}

const errorEnvelope = {
  type: 'object',
  required: ['code', 'message', 'requestId', 'statusCode'],
  properties: {
    code: { type: 'string' },
    message: { type: 'string' },
    requestId: { type: 'string', description: 'Request correlation id, echoed from the x-request-id flow.' },
    statusCode: { type: 'integer' },
  },
};

export const openApiRbacFailures = {
  unauthorized: {
    ...errorEnvelope,
    description: 'Missing, invalid, revoked or expired authentication, or stale fresh-auth window.',
    properties: {
      ...errorEnvelope.properties,
      code: {
        type: 'string',
        enum: ['AUTH_SESSION_INVALID', 'AUTH_REAUTHENTICATION_REQUIRED'],
        example: 'AUTH_SESSION_INVALID',
      },
      message: { type: 'string', example: 'Authentication is required.' },
      statusCode: { type: 'integer', enum: [401], example: 401 },
    },
  },
  forbidden: {
    ...errorEnvelope,
    description: 'Authenticated but lacking the required permission or authentication level.',
    properties: {
      ...errorEnvelope.properties,
      code: { type: 'string', enum: ['FORBIDDEN'], example: 'FORBIDDEN' },
      message: { type: 'string', example: 'Access denied.' },
      statusCode: { type: 'integer', enum: [403], example: 403 },
    },
  },
  validation: {
    ...errorEnvelope,
    description: 'Request body or query failed schema validation.',
    properties: {
      ...errorEnvelope.properties,
      code: { type: 'string', enum: ['INVALID_REQUEST'], example: 'INVALID_REQUEST' },
      message: { type: 'string', example: 'Request validation failed.' },
      statusCode: { type: 'integer', enum: [400], example: 400 },
    },
  },
  notFound: {
    ...errorEnvelope,
    description: 'The target user, role or permission does not exist.',
    properties: {
      ...errorEnvelope.properties,
      code: { type: 'string', enum: ['USER_NOT_FOUND', 'ROLE_NOT_FOUND'], example: 'ROLE_NOT_FOUND' },
      message: { type: 'string', example: 'The role is not available.' },
      statusCode: { type: 'integer', enum: [404], example: 404 },
    },
  },
  conflict: {
    ...errorEnvelope,
    description: 'The mutation conflicts with a safety or policy rule.',
    properties: {
      ...errorEnvelope.properties,
      code: {
        type: 'string',
        enum: ['SOD_VIOLATION', 'LAST_ADMIN_DEMOTION', 'CONFLICT'],
        example: 'SOD_VIOLATION',
      },
      message: { type: 'string', example: 'This assignment would violate a separation-of-duty set.' },
      statusCode: { type: 'integer', enum: [409], example: 409 },
    },
  },
};

const staffSummarySchema = {
  type: 'object',
  required: ['userId', 'email', 'mobile', 'name', 'status', 'activeRoleCount', 'createdAt'],
  properties: {
    userId: { type: 'string' },
    email: { type: 'string', nullable: true },
    mobile: { type: 'string', nullable: true },
    name: { type: 'string' },
    status: { type: 'string', enum: USER_STATUSES },
    activeRoleCount: { type: 'integer' },
    createdAt: { type: 'string', format: 'date-time' },
  },
};

const assignmentViewSchema = {
  type: 'object',
  required: [
    'assignmentId',
    'roleId',
    'roleKey',
    'roleName',
    'roleDescription',
    'isSystem',
    'assignedAt',
    'assignedById',
    'expiresAt',
    'revokedAt',
    'revokeReason',
  ],
  properties: {
    assignmentId: { type: 'string' },
    roleId: { type: 'string' },
    roleKey: { type: 'string' },
    roleName: { type: 'string' },
    roleDescription: { type: 'string', nullable: true },
    isSystem: { type: 'boolean' },
    assignedAt: { type: 'string', format: 'date-time' },
    assignedById: { type: 'string', nullable: true },
    expiresAt: { type: 'string', format: 'date-time', nullable: true },
    revokedAt: { type: 'string', format: 'date-time', nullable: true },
    revokeReason: { type: 'string', nullable: true },
  },
};

const roleViewSchema = {
  type: 'object',
  required: ['id', 'key', 'name', 'description', 'isSystem', 'isActive', 'permissionKeys', 'createdAt', 'updatedAt'],
  properties: {
    id: { type: 'string' },
    key: { type: 'string' },
    name: { type: 'string' },
    description: { type: 'string', nullable: true },
    isSystem: { type: 'boolean' },
    isActive: { type: 'boolean' },
    permissionKeys: { type: 'array', items: { type: 'string' } },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

const permissionViewSchema = {
  type: 'object',
  required: ['id', 'key', 'name', 'description', 'group', 'isActive'],
  properties: {
    id: { type: 'string' },
    key: { type: 'string' },
    name: { type: 'string' },
    description: { type: 'string', nullable: true },
    group: { type: 'string' },
    isActive: { type: 'boolean' },
  },
};

const sodRestrictionViewSchema = {
  type: 'object',
  required: ['id', 'key', 'name', 'description', 'permissionKeys', 'isActive'],
  properties: {
    id: { type: 'string' },
    key: { type: 'string' },
    name: { type: 'string' },
    description: { type: 'string' },
    permissionKeys: { type: 'array', items: { type: 'string' } },
    isActive: { type: 'boolean' },
  },
};

const roleImpactSchema = {
  type: 'object',
  required: ['data'],
  properties: {
    data: {
      type: 'object',
      required: ['role', 'deactivation'],
      properties: {
        role: {
          type: 'object',
          required: ['roleId', 'roleKey', 'name', 'isSystem'],
          properties: {
            roleId: { type: 'string' },
            roleKey: { type: 'string' },
            name: { type: 'string' },
            isSystem: { type: 'boolean' },
          },
        },
        deactivation: {
          type: 'object',
          required: ['totalActiveAssignments', 'users'],
          properties: {
            totalActiveAssignments: { type: 'integer' },
            users: {
              type: 'array',
              items: {
                type: 'object',
                required: ['userId', 'name', 'lostPermissionKeys'],
                properties: {
                  userId: { type: 'string' },
                  name: { type: 'string' },
                  lostPermissionKeys: { type: 'array', items: { type: 'string' } },
                },
              },
            },
          },
        },
      },
    },
  },
};

export const openApiRbacSchemas = {
  staffDirectoryResponse: {
    type: 'object',
    required: ['data'],
    properties: {
      data: {
        type: 'object',
        required: ['items', 'total', 'cursor'],
        properties: {
          items: { type: 'array', items: staffSummarySchema },
          total: { type: 'integer' },
          cursor: { type: 'string', nullable: true },
        },
      },
    },
  },
  staffDetailResponse: {
    type: 'object',
    required: ['data'],
    properties: {
      data: {
        type: 'object',
        required: ['staff'],
        properties: {
          staff: {
            type: 'object',
            properties: {
              ...staffSummarySchema.properties,
              activeGrants: { type: 'array', items: assignmentViewSchema },
              effectivePermissionKeys: { type: 'array', items: { type: 'string' } },
            },
          },
        },
      },
    },
  },
  rolesResponse: {
    type: 'object',
    required: ['data'],
    properties: {
      data: {
        type: 'object',
        required: ['items'],
        properties: { items: { type: 'array', items: roleViewSchema } },
      },
    },
  },
  roleResponse: {
    type: 'object',
    required: ['data'],
    properties: {
      data: {
        type: 'object',
        required: ['role'],
        properties: { role: roleViewSchema },
      },
    },
  },
  permissionsResponse: {
    type: 'object',
    required: ['data'],
    properties: {
      data: {
        type: 'object',
        required: ['items'],
        properties: { items: { type: 'array', items: permissionViewSchema } },
      },
    },
  },
  permissionResponse: {
    type: 'object',
    required: ['data'],
    properties: {
      data: {
        type: 'object',
        required: ['permission'],
        properties: { permission: permissionViewSchema },
      },
    },
  },
  sodRestrictionsResponse: {
    type: 'object',
    required: ['data'],
    properties: {
      data: {
        type: 'object',
        required: ['items'],
        properties: { items: { type: 'array', items: sodRestrictionViewSchema } },
      },
    },
  },
  grantRoleResponse: {
    type: 'object',
    required: ['data'],
    properties: {
      data: {
        type: 'object',
        required: ['assignment'],
        properties: { assignment: assignmentViewSchema },
      },
    },
  },
  revokeRoleResponse: {
    type: 'object',
    required: ['data'],
    properties: {
      data: {
        type: 'object',
        required: ['assignment', 'changed'],
        properties: {
          assignment: { ...assignmentViewSchema, nullable: true },
          changed: { type: 'boolean' },
        },
      },
    },
  },
  roleImpactResponse: roleImpactSchema,
  roleCreate: {
    type: 'object',
    required: ['key', 'name'],
    properties: {
      key: { type: 'string', pattern: String(ROLE_KEY), example: 'warehouse-manager' },
      name: { type: 'string', example: 'Warehouse Manager' },
      description: { type: 'string', nullable: true, maxLength: 2_000 },
    },
  },
  roleUpdate: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      description: { type: 'string', nullable: true },
      isActive: { type: 'boolean' },
      explicitSignal: { type: 'boolean', description: 'Required when re-activating a suspended role.' },
    },
  },
  permissionToggle: {
    type: 'object',
    required: ['isActive'],
    properties: { isActive: { type: 'boolean' } },
  },
  grantRole: {
    type: 'object',
    required: ['roleId'],
    properties: {
      roleId: { type: 'string' },
      expiresAt: { type: 'string', format: 'date-time' },
      reason: { type: 'string', maxLength: 500 },
    },
  },
  revokeRole: {
    type: 'object',
    required: ['revokeReason'],
    properties: { revokeReason: { type: 'string', minLength: 1, maxLength: 500 } },
  },
};