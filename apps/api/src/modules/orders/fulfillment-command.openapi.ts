import type { SchemaObject } from "@nestjs/swagger/dist/interfaces/open-api-spec.interface";
import { failureEnvelope } from "./order-openapi-schemas";

export const openApiFulfillmentCommand = {
  result: {
    type: "object",
    required: ["data"],
    properties: {
      data: {
        type: "object",
        required: ["fulfillment"],
        properties: {
          fulfillment: {
            type: "object",
            required: ["id", "orderId", "status", "updatedAt"],
            properties: {
              id: { type: "string" },
              orderId: { type: "string" },
              status: { type: "string", enum: ["PROCESSING", "READY_TO_SHIP"] },
              updatedAt: { type: "string", format: "date-time" },
            },
          },
        },
      },
    },
  } satisfies SchemaObject,
  error: failureEnvelope,
};
