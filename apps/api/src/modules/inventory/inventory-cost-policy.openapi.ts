import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import { failureError } from '../orders/order-openapi-schemas';
const object = (properties: Record<string, SchemaObject>): SchemaObject => ({ type: 'object', additionalProperties: false, properties, required: Object.keys(properties) });
const method: SchemaObject = { type: 'string', enum: ['FIFO', 'MOVING_WEIGHTED_AVERAGE'], nullable: true, description: 'Null means undecided. Selection alone never enables valuation.' };
const policy = object({ id: { type: 'string' }, version: { type: 'integer', minimum: 1 }, method, createdAt: { type: 'string', format: 'date-time' } });
export const costPolicySchemas = {
  body: object({ method, expectedVersion: { type: 'integer', minimum: 1, maximum: 2147483646, nullable: true }, reason: { type: 'string', minLength: 1, maxLength: 500 } }),
  response: object({ data: object({ policy: { ...policy, nullable: true }, valuationEnabled: { type: 'boolean', enum: [false] },
    activationGate: { type: 'string', enum: ['COST_LEDGER_ACCEPTANCE_REQUIRED'] }, missingCostTreatment: { type: 'string', enum: ['REQUIRE_EVIDENCE'] } }) }),
  unauthorized: failureError(['AUTH_SESSION_INVALID', 'AUTH_REAUTHENTICATION_REQUIRED'], 401),
  forbidden: failureError(['FORBIDDEN'], 403), invalid: failureError(['VALIDATION_ERROR'], 400),
  conflict: failureError(['STALE_VERSION', 'IDEMPOTENCY_CONFLICT', 'CONFLICT'], 409), unavailable: failureError(['INVENTORY_COST_POLICY_UNAVAILABLE'], 500),
};
