import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';

const entry: SchemaObject = {
  type: 'object',
  required: ['id', 'actorId', 'actorLabel', 'action', 'entityType', 'entityId', 'before', 'after', 'metadata', 'requestId', 'ipHash', 'userAgent', 'createdAt'],
  properties: {
    id: { type: 'string' },
    actorId: { type: 'string', nullable: true },
    actorLabel: { type: 'string', nullable: true },
    action: { type: 'string' },
    entityType: { type: 'string' },
    entityId: { type: 'string', nullable: true },
    before: { nullable: true },
    after: { nullable: true },
    metadata: { nullable: true },
    requestId: { type: 'string', nullable: true },
    ipHash: { type: 'string', nullable: true },
    userAgent: { type: 'string', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
  },
};

export const auditOpenApi = {
  list: {
    type: 'object',
    required: ['items', 'count'],
    properties: {
      items: { type: 'array', items: entry },
      count: { type: 'integer' },
    },
  } satisfies SchemaObject,
};