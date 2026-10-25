import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
const text: SchemaObject = { type: 'string' },
  integer: SchemaObject = { type: 'integer', minimum: 0 };
const object = (
  properties: Record<string, SchemaObject>,
  required = Object.keys(properties),
): SchemaObject => ({
  type: 'object',
  additionalProperties: false,
  required,
  properties,
});
/** Direct `data` of both the request response and the status poll. */
export const reportExportOpenApi = {
  request: object({
    data: object({
      exportId: text,
      status: { type: 'string', enum: ['PENDING', 'READY'] },
      sha256: { ...text, pattern: '^[a-f0-9]{64}$', nullable: true },
      byteCount: { ...integer, nullable: true },
      replayed: { type: 'boolean' },
    }),
  }),
};
