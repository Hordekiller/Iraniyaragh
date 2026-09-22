import type { SchemaObject } from "@nestjs/swagger/dist/interfaces/open-api-spec.interface";
import { failureError } from "./order-openapi-schemas";

const cancelOrder: SchemaObject = {
  type: "object",
  required: ["id", "number", "status", "releasedReservations", "cancelledAt"],
  properties: {
    id: { type: "string" },
    number: { type: "string" },
    status: { type: "string", enum: ["CANCELLED"] },
    releasedReservations: { type: "integer", minimum: 0 },
    cancelledAt: { type: "string", format: "date-time" },
  },
};

export const openApiOrderCommand = {
  cancelResponse: {
    type: "object",
    required: ["data"],
    properties: {
      data: {
        type: "object",
        required: ["order"],
        properties: { order: cancelOrder },
      },
    },
  } satisfies SchemaObject,
  failures: {
    validation: failureError(["INVALID_REQUEST"], 400),
    unauthorized: failureError(["AUTH_SESSION_INVALID"], 401),
    forbidden: failureError(["FORBIDDEN"], 403),
    notFound: failureError(["ORDER_NOT_FOUND"], 404),
    conflict: failureError(
      ["IDEMPOTENCY_CONFLICT", "ORDER_STATE_CONFLICT", "CONFLICT"],
      409,
    ),
  },
};
