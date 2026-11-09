import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';

const permission: SchemaObject = {
  type: 'object',
  required: ['key', 'name', 'description', 'group', 'isActive'],
  properties: {
    key: { type: 'string' },
    name: { type: 'string' },
    description: { type: 'string' },
    group: { type: 'string' },
    isActive: { type: 'boolean' },
  },
};

const role: SchemaObject = {
  type: 'object',
  required: [
    'id', 'key', 'name', 'description', 'isSystem', 'isActive', 'version',
    'permissionKeys', 'memberCount', 'activeMemberCount', 'createdAt', 'updatedAt',
  ],
  properties: {
    id: { type: 'string' },
    key: { type: 'string' },
    name: { type: 'string' },
    description: { type: 'string', nullable: true },
    isSystem: { type: 'boolean' },
    isActive: { type: 'boolean' },
    version: { type: 'integer' },
    permissionKeys: { type: 'array', items: { type: 'string' } },
    memberCount: { type: 'integer' },
    activeMemberCount: { type: 'integer' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

const member: SchemaObject = {
  type: 'object',
  required: ['userId', 'displayName', 'mobileMasked', 'emailMasked', 'status', 'assignedAt', 'expiresAt', 'assignmentExpired'],
  properties: {
    userId: { type: 'string' },
    displayName: { type: 'string', nullable: true },
    mobileMasked: { type: 'string', nullable: true },
    emailMasked: { type: 'string', nullable: true },
    status: { type: 'string', enum: ['ACTIVE', 'PENDING', 'SUSPENDED', 'LOCKED', 'DELETED'] },
    assignedAt: { type: 'string', format: 'date-time' },
    expiresAt: { type: 'string', format: 'date-time', nullable: true },
    assignmentExpired: { type: 'boolean' },
  },
};

const detail: SchemaObject = {
  allOf: [
    role,
    {
      type: 'object',
      required: ['permissions', 'members'],
      properties: {
        permissions: { type: 'array', items: permission },
        members: { type: 'array', items: member },
      },
    },
  ],
};

const user: SchemaObject = {
  type: 'object',
  required: ['id', 'displayName', 'mobileMasked', 'emailMasked', 'status', 'roleKeys', 'isActiveAdmin', 'createdAt'],
  properties: {
    id: { type: 'string' },
    displayName: { type: 'string', nullable: true },
    mobileMasked: { type: 'string', nullable: true },
    emailMasked: { type: 'string', nullable: true },
    status: { type: 'string', enum: ['ACTIVE', 'PENDING', 'SUSPENDED', 'LOCKED', 'DELETED'] },
    roleKeys: { type: 'array', items: { type: 'string' } },
    isActiveAdmin: { type: 'boolean' },
    createdAt: { type: 'string', format: 'date-time' },
  },
};

const historyEntry: SchemaObject = {
  type: 'object',
  required: ['id', 'action', 'actorId', 'actorLabel', 'metadata', 'createdAt'],
  properties: {
    id: { type: 'string' },
    action: { type: 'string' },
    actorId: { type: 'string', nullable: true },
    actorLabel: { type: 'string', nullable: true },
    metadata: { type: 'object', nullable: true, additionalProperties: true },
    createdAt: { type: 'string', format: 'date-time' },
  },
};

const listMeta: SchemaObject = {
  type: 'object',
  required: ['page', 'perPage', 'total', 'pages'],
  properties: {
    page: { type: 'integer' },
    perPage: { type: 'integer' },
    total: { type: 'integer' },
    pages: { type: 'integer' },
  },
};

export const accessOpenApi = {
  role,
  detail,
  permission,
  user,
  historyEntry,
  list: {
    type: 'object',
    required: ['data'],
    properties: {
      data: {
        type: 'object',
        required: ['items'],
        properties: { items: { type: 'array', items: role } },
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
        properties: { role: detail },
      },
    },
  },
  permissionList: {
    type: 'object',
    required: ['data'],
    properties: {
      data: {
        type: 'object',
        required: ['items'],
        properties: { items: { type: 'array', items: permission } },
      },
    },
  },
  userList: {
    type: 'object',
    required: ['data'],
    properties: {
      data: {
        type: 'object',
        required: ['items', 'meta'],
        properties: {
          items: { type: 'array', items: user },
          meta: listMeta,
        },
      },
    },
  },
  history: {
    type: 'object',
    required: ['data'],
    properties: {
      data: {
        type: 'object',
        required: ['items'],
        properties: {
          items: { type: 'array', items: historyEntry },
          total: { type: 'integer' },
        },
      },
    },
  },
  create: {
    type: 'object',
    required: ['key', 'name', 'permissionKeys'],
    properties: {
      key: { type: 'string', example: 'catalog-editor' },
      name: { type: 'string', example: 'Catalog editor' },
      description: { type: 'string', nullable: true },
      permissionKeys: { type: 'array', items: { type: 'string' } },
    },
  },
  update: {
    type: 'object',
    required: ['expectedVersion'],
    properties: {
      expectedVersion: { type: 'integer' },
      name: { type: 'string' },
      description: { type: 'string', nullable: true },
      isActive: { type: 'boolean' },
    },
  },
  permissions: {
    type: 'object',
    required: ['expectedVersion', 'permissionKeys'],
    properties: {
      expectedVersion: { type: 'integer' },
      permissionKeys: { type: 'array', items: { type: 'string' } },
    },
  },
  assign: {
    type: 'object',
    required: ['expectedVersion', 'userId'],
    properties: {
      expectedVersion: { type: 'integer' },
      userId: { type: 'string' },
      expiresAt: { type: 'string', format: 'date-time', nullable: true },
    },
  },
  revoke: {
    type: 'object',
    required: ['expectedVersion'],
    properties: {
      expectedVersion: { type: 'integer' },
      reason: { type: 'string', nullable: true },
    },
  },
} satisfies Record<string, SchemaObject>;
