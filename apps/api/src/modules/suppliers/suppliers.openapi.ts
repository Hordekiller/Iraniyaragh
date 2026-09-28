import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';

const supplier: SchemaObject = {
  type: 'object',
  required: ['id', 'code', 'name', 'mobile', 'phone', 'email', 'nationalId', 'economicCode', 'isActive', 'version', 'createdAt', 'updatedAt'],
  properties: {
    id: { type: 'string' }, code: { type: 'string' }, name: { type: 'string' },
    mobile: { type: 'string', nullable: true }, phone: { type: 'string', nullable: true },
    email: { type: 'string', nullable: true }, nationalId: { type: 'string', nullable: true },
    economicCode: { type: 'string', nullable: true }, isActive: { type: 'boolean' },
    version: { type: 'integer' }, createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};
const page = (item: SchemaObject): SchemaObject => ({ type: 'object', required: ['items', 'count'],
  properties: { items: { type: 'array', items: item }, count: { type: 'integer' } } });
const contactFields = { mobile: { type: 'string', nullable: true }, phone: { type: 'string', nullable: true },
  email: { type: 'string', format: 'email', nullable: true }, nationalId: { type: 'string', nullable: true },
  economicCode: { type: 'string', nullable: true } } as const;

export const suppliersOpenApi = {
  supplier,
  list: page(supplier),
  history: page({ type: 'object', required: ['id', 'action', 'actorId', 'createdAt'], properties: {
    id: { type: 'string' }, action: { type: 'string' }, actorId: { type: 'string', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
  } }),
  create: { type: 'object', required: ['code', 'name'], properties: {
    code: { type: 'string' }, name: { type: 'string' }, ...contactFields,
  } } satisfies SchemaObject,
  update: { type: 'object', required: ['expectedVersion'], properties: {
    expectedVersion: { type: 'integer', minimum: 0 }, name: { type: 'string' }, isActive: { type: 'boolean' }, ...contactFields,
  } } satisfies SchemaObject,
};
