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
  snapshot: object({
    data: object({
      exportId: text,
      definition: { type: 'object' },
      sha256: { ...text, pattern: '^[a-f0-9]{64}$' },
      generatedAt: { ...text, format: 'date-time' },
      expiresAt: { ...text, format: 'date-time' },
      headers: { type: 'array', minItems: 1, maxItems: 64, items: text },
      rows: {
        type: 'array',
        maxItems: 20000,
        items: { type: 'array', maxItems: 64, items: text },
      },
    }),
  }),
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
