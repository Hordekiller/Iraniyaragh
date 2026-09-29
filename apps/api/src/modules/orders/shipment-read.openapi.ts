import type { SchemaObject } from "@nestjs/swagger/dist/interfaces/open-api-spec.interface";
import { failureEnvelope } from "./order-openapi-schemas";
import { FULFILLMENT_STATUS_VALUES } from "./shipment-read.dto";

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

const address: SchemaObject = {
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
    "Immutable dispatch address snapshot with direct customer PII masked by default. Null only when a legacy row does not carry the accepted snapshot shape.",
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

const line: SchemaObject = {
  type: "object",
  additionalProperties: false,
  required: [
    "orderItemId",
    "sku",
    "productTitle",
    "variantTitle",
    "quantity",
  ],
  properties: {
    orderItemId: { type: "string" },
    sku: { type: "string" },
    productTitle: { type: "string" },
    variantTitle: { type: "string", nullable: true },
    quantity: { type: "integer", minimum: 1 },
  },
};

const event: SchemaObject = {
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "from",
    "to",
    "kind",
    "proofReference",
    "actor",
    "requestId",
    "createdAt",
  ],
  properties: {
    id: { type: "string" },
    from: {
      type: "string",
      nullable: true,
      enum: [...FULFILLMENT_STATUS_VALUES, null],
    },
    to: { type: "string", enum: [...FULFILLMENT_STATUS_VALUES] },
    kind: {
      type: "string",
      enum: ["DISPATCH", "DELIVERY_PROOF", "STATE_CHANGE"],
    },
    proofReference: { type: "string", nullable: true },
    actor,
    requestId: { type: "string", nullable: true },
    createdAt: { type: "string", format: "date-time" },
  },
  description:
    "One persisted fulfillment transition, oldest first. The free-text transition reason is never exposed; only the structured staff delivery proof reference is projected.",
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

const summaryProperties: Record<string, SchemaObject> = {
  id: { type: "string" },
  orderId: { type: "string" },
  orderNumber: { type: "string" },
  status: { type: "string", enum: [...FULFILLMENT_STATUS_VALUES] },
  carrier: { type: "string" },
  trackingCode: { type: "string" },
  itemCount: { type: "integer", minimum: 0 },
  totalQuantity: { type: "integer", minimum: 0 },
  city: { type: "string", nullable: true },
  customer,
  dispatchedAt: { type: "string", format: "date-time" },
};

const summaryRequired = [
  "id",
  "orderId",
  "orderNumber",
  "status",
  "carrier",
  "trackingCode",
  "itemCount",
  "totalQuantity",
  "city",
  "customer",
  "dispatchedAt",
];

const summary: SchemaObject = {
  type: "object",
  additionalProperties: false,
  required: summaryRequired,
  properties: summaryProperties,
};

const detail: SchemaObject = {
  type: "object",
  additionalProperties: false,
  required: [
    ...summaryRequired,
    "address",
    "dispatchedBy",
    "lines",
    "timeline",
  ],
  properties: {
    ...summaryProperties,
    address,
    dispatchedBy: actor,
    lines: { type: "array", maxItems: 100, items: line },
    timeline: { type: "array", maxItems: 50, items: event },
  },
};

const listResponse: SchemaObject = {
  type: "object",
  additionalProperties: false,
  required: ["data"],
  properties: {
    data: {
      type: "object",
      additionalProperties: false,
      required: ["items", "meta"],
      properties: { items: { type: "array", items: summary }, meta },
    },
  },
};

const detailResponse: SchemaObject = {
  type: "object",
  additionalProperties: false,
  required: ["data"],
  properties: {
    data: {
      type: "object",
      additionalProperties: false,
      required: ["shipment"],
      properties: { shipment: detail },
    },
  },
};

const failure = (
  description: string,
): SchemaObject & { description: string } => ({
  type: 'object',
  description,
  additionalProperties: true,
  required: failureEnvelope.required as string[],
  properties: failureEnvelope.properties,
});

export const openApiShipmentRead = {
  list: listResponse,
  detail: detailResponse,
  failures: {
    validation: failure("Invalid query or path input."),
    unauthorized: failure("A valid live access token is required."),
    forbidden: failure(
      "The authentication level or shipments.read permission is missing.",
    ),
    notFound: failure("The requested shipment does not exist."),
  },
} as const;
