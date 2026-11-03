import type { SchemaObject } from "@nestjs/swagger/dist/interfaces/open-api-spec.interface";
import { DOOR_STATUSES } from "@iranyaragh/contracts";
const text: SchemaObject = { type: "string" };
const int: SchemaObject = { type: "integer" };
const bool: SchemaObject = { type: "boolean" };
const money: SchemaObject = {
  type: "string",
  pattern: "^(0|[1-9][0-9]{0,18})$",
  description: "Integer IRR; never a floating-point amount.",
};
const nullable = (schema: SchemaObject): SchemaObject => ({
  ...schema,
  nullable: true,
});
const arr = (items: SchemaObject): SchemaObject => ({ type: "array", items });
const obj = (
  properties: Record<string, SchemaObject>,
  required = Object.keys(properties),
): SchemaObject => ({ type: "object", required, properties });
const ref = (name: string): SchemaObject => ({
  allOf: [{ $ref: `#/components/schemas/${name}` }],
});
const deposit = obj({
  kind: { type: "string", enum: ["PERCENT", "FIXED"] },
  value: money,
  minimum: money,
});
const component = obj({
  slot: text,
  basis: {
    type: "string",
    enum: ["AREA", "PERIMETER", "WIDTH", "HEIGHT", "FIXED"],
  },
  multiplier: int,
  divisor: int,
  widthDeductionMm: int,
  heightDeductionMm: int,
  wasteBps: int,
  minimumQuantity: text,
});
const extra = obj({ title: text, amount: money });
const modelConfiguration = obj({
  technical: nullable(
    obj({
      minWidthMm: int,
      maxWidthMm: int,
      minHeightMm: int,
      maxHeightMm: int,
      toleranceMm: int,
    }),
  ),
  manualApproval: bool,
  slots: arr(
    obj({ key: text, title: text, materialIds: arr(text), required: bool }),
  ),
  incompatible: arr(obj({ materialIds: arr(text), reason: text })),
  components: arr(component),
  labor: nullable(obj({ fixed: money, perSquareMeter: money })),
  additional: arr(extra),
  taxBps: int,
  discount: money,
  minimumTotal: money,
  deposit: nullable(deposit),
});
const model = obj({
  id: text,
  code: text,
  title: text,
  type: { type: "string", enum: ["FORMLEX", "DECOFIX"] },
  active: bool,
  version: int,
  configuration: modelConfiguration,
  imageMediaId: nullable(text),
  imageUrl: nullable(text),
});
const materialConfiguration = obj({
  unit: { type: "string", enum: ["M2", "M", "EACH"] },
  rate: nullable(money),
  validUntil: nullable(text),
  specifications: text,
  color: text,
  thicknessMm: nullable(int),
  processingFee: money,
  stockUnit: nullable({ type: "string", enum: ["PIECE", "MM", "MM2"] }),
});
const material = obj({
  id: text,
  code: text,
  title: text,
  category: {
    type: "string",
    enum: ["GLASS", "PROFILE", "HARDWARE", "SERVICE"],
  },
  active: bool,
  version: int,
  variantId: nullable(text),
  configuration: materialConfiguration,
});
const part = obj({
  title: text,
  amount: nullable(money),
  quantityNumerator: { type: "string", pattern: "^[0-9]+$" },
  quantityDenominator: { type: "string", pattern: "^[1-9][0-9]*$" },
  materialId: text,
  variantId: nullable(text),
  unit: text,
  stockUnit: nullable(text),
});
export const doorQuoteSnapshotSchema = obj({
  currency: { type: "string", enum: ["IRR"] },
  lines: arr(
    obj({
      item: int,
      title: text,
      quantity: int,
      widthMm: int,
      heightMm: int,
      unitTotal: nullable(money),
      total: nullable(money),
      parts: arr(part),
      model: ref("DoorModel"),
      materials: arr(ref("DoorMaterial")),
    }),
  ),
  reasons: arr(text),
  calculatedTotal: nullable(money),
  total: nullable(money),
  deposit: nullable(money),
  depositPolicy: nullable(deposit),
  adjustments: arr(extra),
  approvalReason: nullable(text),
});
const quote = obj({
  id: text,
  version: int,
  approved: bool,
  snapshot: ref("DoorQuoteSnapshot"),
  createdAt: text,
});
const item = obj({
  modelId: text,
  widthMm: int,
  heightMm: int,
  quantity: int,
  selections: arr(obj({ slot: text, materialId: text })),
  notes: text,
});
export const doorOrderSchema = obj({
  id: text,
  commerceVersion: int,
  number: text,
  customerId: text,
  customerLabel: text,
  status: { type: "string", enum: [...DOOR_STATUSES] },
  version: int,
  technicalApproved: bool,
  customerAcceptedQuoteVersion: nullable(int),
  items: arr(item),
  quote,
  quotes: arr(quote),
  paid: money,
  remaining: nullable(money),
  refundableCredit: money,
  financialStatus: {
    type: "string",
    enum: ["UNPRICED", "UNPAID", "PARTIAL", "SETTLED", "CREDIT"],
  },
  payments: arr(
    obj({
      id: text,
      amount: money,
      refunded: money,
      status: text,
      referenceId: nullable(text),
      quoteId: nullable(text),
      createdAt: text,
    }),
  ),
  records: arr(obj({ id: text, action: text, message: text, createdAt: text })),
  requirements: arr(
    obj({
      id: text,
      quoteId: text,
      materialId: text,
      variantId: nullable(text),
      snapshot: part,
      actualStockQuantity: nullable(int),
      reservationId: nullable(text),
      reservationStatus: nullable(text),
      consumedAt: nullable(text),
    }),
  ),
  attachments: arr(obj({ id: text, filename: text, mime: text, bytes: int })),
  delivery: nullable(obj({ recipient: text, address: text, tracking: text })),
  createdAt: text,
});
const envelope = (data: SchemaObject) => obj({ data });
export const doorResponses = {
  catalog: {
    schema: envelope(
      obj({
        models: arr(ref("DoorModel")),
        materials: arr(ref("DoorMaterial")),
        floatingEnabled: bool,
        settingsVersion: int,
      }),
    ),
  },
  visibility: { schema: envelope(obj({ enabled: bool })) },
  preview: { schema: envelope(obj({ quote: ref("DoorQuoteSnapshot") })) },
  order: { schema: envelope(obj({ order: ref("DoorOrder") })) },
  list: {
    schema: envelope(
      obj({
        items: arr(ref("DoorOrder")),
        count: int,
        offset: int,
        limit: int,
      }),
    ),
  },
  report: {
    schema: envelope(
      obj({
        count: int,
        quotedTotal: money,
        paid: money,
        remaining: money,
        statuses: arr(
          obj({
            status: { type: "string", enum: [...DOOR_STATUSES] },
            count: int,
          }),
        ),
      }),
    ),
  },
} as const;

export const doorOpenApiSchemas = {
  DoorModel: model,
  DoorMaterial: material,
  DoorQuoteSnapshot: doorQuoteSnapshotSchema,
  DoorOrder: doorOrderSchema,
};
