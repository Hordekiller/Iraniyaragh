import type { SchemaObject } from "@nestjs/swagger/dist/interfaces/open-api-spec.interface";
import { failureEnvelope } from "./order-openapi-schemas";
import {
  FULFILLMENT_STATUS_VALUES,
  ORDER_STATUS_VALUES,
  PAYMENT_STATUS_VALUES,
} from "./order-read.dto";

const money: SchemaObject = {
  type: "object",
  additionalProperties: false,
  required: ["amount", "currency"],
  properties: {
    amount: { type: "string", pattern: "^[0-9]+$" },
    currency: { type: "string", enum: ["IRR"] },
  },
};

const totals: SchemaObject = {
  type: "object",
  additionalProperties: false,
  required: ["subtotal", "discount", "shipping", "total"],
  properties: {
    subtotal: money,
    discount: money,
    shipping: money,
    total: money,
  },
};

const customer: SchemaObject = {
  type: "object",
  additionalProperties: false,
  required: ["id", "displayNameMasked", "mobileMasked"],
  properties: {
    id: { type: "string" },
    displayNameMasked: { type: "string", nullable: true },
    mobileMasked: { type: "string" },
  },
};

const summaryProperties: Record<string, SchemaObject> = {
  id: { type: "string" },
  number: { type: "string" },
  status: { type: "string", enum: [...ORDER_STATUS_VALUES] },
  payment: {
    type: "object",
    additionalProperties: false,
    required: ["latestStatus", "attemptCount"],
    properties: {
      latestStatus: {
        type: "string",
        enum: [...PAYMENT_STATUS_VALUES],
        nullable: true,
      },
      attemptCount: { type: "integer", minimum: 0 },
    },
  },
  fulfillmentStatus: {
    type: "string",
    enum: [...FULFILLMENT_STATUS_VALUES],
    nullable: true,
  },
  itemCount: { type: "integer", minimum: 0 },
  totals,
  reservationExpiresAt: { type: "string", format: "date-time" },
  createdAt: { type: "string", format: "date-time" },
  updatedAt: { type: "string", format: "date-time" },
};

const summaryRequired = [
  "id",
  "number",
  "status",
  "payment",
  "fulfillmentStatus",
  "itemCount",
  "totals",
  "reservationExpiresAt",
  "createdAt",
  "updatedAt",
];

const orderSummary: SchemaObject = {
  type: "object",
  additionalProperties: false,
  required: summaryRequired,
  properties: summaryProperties,
};

const adminOrderSummary: SchemaObject = {
  type: "object",
  additionalProperties: false,
  required: [...summaryRequired, "customer"],
  properties: { ...summaryProperties, customer },
};

const meta: SchemaObject = {
  type: "object",
  additionalProperties: false,
  required: ["page", "perPage", "total", "pages"],
  properties: {
    page: { type: "integer", minimum: 1, maximum: 10_000 },
    perPage: { type: "integer", minimum: 1, maximum: 100 },
    total: { type: "integer", minimum: 0 },
    pages: { type: "integer", minimum: 0 },
  },
};

const address: SchemaObject = {
  type: "object",
  nullable: true,
  additionalProperties: false,
  required: [
    "provinceCode",
    "city",
    "address",
    "postalCode",
    "recipient",
    "mobile",
  ],
  properties: {
    provinceCode: { type: "string" },
    city: { type: "string" },
    address: { type: "string" },
    postalCode: { type: "string" },
    recipient: { type: "string" },
    mobile: { type: "string" },
  },
  description:
    "Immutable checkout snapshot. Null only for a legacy order without the accepted snapshot shape.",
};

const adminAddress: SchemaObject = {
  type: "object",
  nullable: true,
  additionalProperties: false,
  required: [
    "provinceCode",
    "city",
    "addressMasked",
    "postalCodeMasked",
    "recipientMasked",
    "mobileMasked",
  ],
  properties: {
    provinceCode: { type: "string" },
    city: { type: "string" },
    addressMasked: { type: "string" },
    postalCodeMasked: { type: "string" },
    recipientMasked: { type: "string" },
    mobileMasked: { type: "string" },
  },
  description:
    "Operational geography with direct customer PII masked by default.",
};

const line: SchemaObject = {
  type: "object",
  additionalProperties: false,
  required: [
    "variantId",
    "sku",
    "productTitle",
    "variantTitle",
    "quantity",
    "unitPrice",
    "lineTotal",
  ],
  properties: {
    variantId: { type: "string" },
    sku: { type: "string" },
    productTitle: { type: "string" },
    variantTitle: { type: "string", nullable: true },
    quantity: { type: "integer", minimum: 1 },
    unitPrice: money,
    lineTotal: money,
  },
};

const payment: SchemaObject = {
  type: "object",
  additionalProperties: false,
  required: ["id", "status", "amount", "createdAt", "updatedAt"],
  properties: {
    id: { type: "string" },
    status: { type: "string", enum: [...PAYMENT_STATUS_VALUES] },
    amount: money,
    createdAt: { type: "string", format: "date-time" },
    updatedAt: { type: "string", format: "date-time" },
  },
};

const fulfillment: SchemaObject = {
  type: "object",
  nullable: true,
  additionalProperties: false,
  required: ["status", "createdAt", "updatedAt"],
  properties: {
    status: { type: "string", enum: [...FULFILLMENT_STATUS_VALUES] },
    createdAt: { type: "string", format: "date-time" },
    updatedAt: { type: "string", format: "date-time" },
  },
};

const actor: SchemaObject = {
  type: "object",
  nullable: true,
  additionalProperties: false,
  required: ["id", "displayNameMasked"],
  properties: {
    id: { type: "string" },
    displayNameMasked: { type: "string", nullable: true },
  },
};

const transitionProperties: Record<string, SchemaObject> = {
  domain: { type: "string", enum: ["ORDER", "PAYMENT", "FULFILLMENT"] },
  from: {
    type: "string",
    nullable: true,
    enum: [
      ...new Set([
        ...ORDER_STATUS_VALUES,
        ...PAYMENT_STATUS_VALUES,
        ...FULFILLMENT_STATUS_VALUES,
      ]),
    ],
  },
  to: {
    type: "string",
    enum: [
      ...new Set([
        ...ORDER_STATUS_VALUES,
        ...PAYMENT_STATUS_VALUES,
        ...FULFILLMENT_STATUS_VALUES,
      ]),
    ],
  },
  createdAt: { type: "string", format: "date-time" },
};

const timelineEntry: SchemaObject = {
  type: "object",
  additionalProperties: false,
  required: ["domain", "from", "to", "createdAt"],
  properties: transitionProperties,
};

const adminTimelineEntry: SchemaObject = {
  type: "object",
  additionalProperties: false,
  required: [
    "domain",
    "from",
    "to",
    "reason",
    "actor",
    "requestId",
    "createdAt",
  ],
  properties: {
    ...transitionProperties,
    reason: { type: "string", nullable: true },
    actor,
    requestId: { type: "string", nullable: true },
  },
};

const commonDetailProperties: Record<string, SchemaObject> = {
  ...summaryProperties,
  address,
  shippingMethod: {
    type: "object",
    additionalProperties: false,
    required: ["code", "title"],
    properties: { code: { type: "string" }, title: { type: "string" } },
  },
  pricePolicyRevision: { type: "string" },
  shippingPolicyRevision: { type: "string" },
  items: { type: "array", maxItems: 100, items: line },
  payments: { type: "array", maxItems: 100, items: payment },
  fulfillment,
};

const commonDetailRequired = [
  ...summaryRequired,
  "address",
  "shippingMethod",
  "pricePolicyRevision",
  "shippingPolicyRevision",
  "items",
  "payments",
  "fulfillment",
  "timeline",
  "truncation",
];

const customerDetail: SchemaObject = {
  type: "object",
  additionalProperties: false,
  required: commonDetailRequired,
  properties: {
    ...commonDetailProperties,
    timeline: { type: "array", maxItems: 100, items: timelineEntry },
    truncation: {
      type: "object",
      additionalProperties: false,
      required: ["items", "payments", "timeline"],
      properties: {
        items: { type: "boolean" },
        payments: { type: "boolean" },
        timeline: { type: "boolean" },
      },
    },
  },
};

const adminDetail: SchemaObject = {
  type: "object",
  additionalProperties: false,
  required: [...commonDetailRequired, "customer", "audit"],
  properties: {
    ...commonDetailProperties,
    address: adminAddress,
    customer,
    timeline: { type: "array", maxItems: 100, items: adminTimelineEntry },
    audit: {
      type: "array",
      maxItems: 100,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["action", "actor", "requestId", "createdAt"],
        properties: {
          action: { type: "string" },
          actor,
          requestId: { type: "string", nullable: true },
          createdAt: { type: "string", format: "date-time" },
        },
      },
    },
    truncation: {
      type: "object",
      additionalProperties: false,
      required: ["items", "payments", "timeline", "audit"],
      properties: {
        items: { type: "boolean" },
        payments: { type: "boolean" },
        timeline: { type: "boolean" },
        audit: { type: "boolean" },
      },
    },
  },
};

const listResponse = (item: SchemaObject): SchemaObject => ({
  type: "object",
  additionalProperties: false,
  required: ["data"],
  properties: {
    data: {
      type: "object",
      additionalProperties: false,
      required: ["items", "meta"],
      properties: { items: { type: "array", items: item }, meta },
    },
  },
});

const detailResponse = (order: SchemaObject): SchemaObject => ({
  type: "object",
  additionalProperties: false,
  required: ["data"],
  properties: {
    data: {
      type: "object",
      additionalProperties: false,
      required: ["order"],
      properties: { order },
    },
  },
});

const failure = (
  description: string,
): SchemaObject & { description: string } => ({
  type: 'object',
  description,
  additionalProperties: true,
  required: failureEnvelope.required as string[],
  properties: failureEnvelope.properties,
});

export const openApiOrderRead = {
  customerList: listResponse(orderSummary),
  customerDetail: detailResponse(customerDetail),
  adminList: listResponse(adminOrderSummary),
  adminDetail: detailResponse(adminDetail),
  failures: {
    validation: failure("Invalid query or path input."),
    unauthorized: failure("A valid live access token is required."),
    forbidden: failure(
      "The authentication level or orders.read permission is missing.",
    ),
    customerNotFound: failure(
      "The order is absent or is not owned by the authenticated customer.",
    ),
    adminNotFound: failure("The requested order does not exist."),
  },
} as const;
