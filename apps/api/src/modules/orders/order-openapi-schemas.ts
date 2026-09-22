import type { SchemaObject } from "@nestjs/swagger/dist/interfaces/open-api-spec.interface";

export const failureEnvelope: SchemaObject = {
  type: "object",
  required: ["code", "message", "requestId", "statusCode"],
  properties: {
    code: { type: "string" },
    message: { type: "string" },
    requestId: { type: "string" },
    statusCode: { type: "integer" },
  },
};

export function failureError(
  codes: string[],
  statusCode: number,
): SchemaObject {
  return {
    ...failureEnvelope,
    properties: {
      ...failureEnvelope.properties,
      code: { type: "string", enum: codes },
      statusCode: { type: "integer", enum: [statusCode] },
    },
  };
}
