import type { SchemaObject } from "@nestjs/swagger/dist/interfaces/open-api-spec.interface";
import { failureError } from "./order-openapi-schemas";
import { openApiCartView } from "./checkout.openapi";

const response: SchemaObject = {
  type: "object",
  required: ["data"],
  properties: {
    data: {
      type: "object",
      required: ["cart"],
      properties: { cart: openApiCartView },
    },
  },
};

const mergeResponse: SchemaObject = {
  type: "object",
  required: ["data"],
  properties: {
    data: {
      type: "object",
      required: ["cart", "warnings"],
      properties: {
        cart: openApiCartView,
        warnings: {
          type: "array",
          items: {
            type: "object",
            required: ["variantId", "code"],
            properties: {
              variantId: { type: "string" },
              code: {
                type: "string",
                enum: ["QUANTITY_CAPPED", "LINE_LIMIT_REACHED"],
              },
            },
          },
        },
      },
    },
  },
};

export const openApiCart = {
  mutationBody: {
    type: "object",
    required: ["variantId", "quantity"],
    properties: {
      variantId: { type: "string", minLength: 1, maxLength: 191 },
      quantity: { type: "integer", minimum: 1, maximum: 99 },
    },
  } satisfies SchemaObject,
  response,
  mergeResponse,
  failures: {
    validation: failureError(["INVALID_REQUEST", "VALIDATION_ERROR"], 400),
    unauthorized: failureError(["AUTH_SESSION_INVALID"], 401),
    forbidden: failureError(["FORBIDDEN"], 403),
    csrfForbidden: failureError(["AUTH_CSRF_INVALID"], 403),
    authOrCsrfForbidden: failureError(["AUTH_CSRF_INVALID", "FORBIDDEN"], 403),
    rateLimited: failureError(["RATE_LIMITED"], 429),
    unavailable: failureError(["UPSTREAM_UNAVAILABLE"], 503),
    notFound: failureError(["SKU_NOT_FOUND"], 404),
    conflict: failureError(
      ["CART_LINE_LIMIT_EXCEEDED", "IDEMPOTENCY_CONFLICT", "CONFLICT"],
      409,
    ),
    unprocessable: failureError(["CART_QUANTITY_INVALID"], 422),
  },
};
