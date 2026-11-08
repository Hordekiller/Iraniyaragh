import type { DoorGlassSampleKey } from "./door-glass-samples";
/** All persisted monetary values are integer IRR strings. Dimensions are mm. */
export type DoorType = "FORMLEX" | "DECOFIX";
export type DoorBasis = "AREA" | "PERIMETER" | "WIDTH" | "HEIGHT" | "FIXED";
export type DoorDepositPolicy = {
  kind: "PERCENT" | "FIXED";
  value: string;
  minimum: string;
};
export type DoorPricingComponent = {
  slot: string;
  basis: DoorBasis;
  multiplier: number;
  divisor: number;
  widthDeductionMm: number;
  heightDeductionMm: number;
  wasteBps: number;
  minimumQuantity: string;
};
export type DoorModelConfiguration = {
  technical: {
    minWidthMm: number;
    maxWidthMm: number;
    minHeightMm: number;
    maxHeightMm: number;
    toleranceMm: number;
  } | null;
  manualApproval: boolean;
  slots: {
    key: string;
    title: string;
    materialIds: string[];
    required: boolean;
  }[];
  incompatible: { materialIds: string[]; reason: string }[];
  components: DoorPricingComponent[];
  labor: { fixed: string; perSquareMeter: string } | null;
  additional: { title: string; amount: string }[];
  taxBps: number;
  discount: string;
  minimumTotal: string;
  deposit: DoorDepositPolicy | null;
};
export type DoorMaterialConfiguration = {
  /** Optional synthetic illustration, never proof of actual material/color availability. */
  sampleKey?: DoorGlassSampleKey | null;
  /** READY image selected through the existing media library. */
  imageMediaId?: string | null;
  unit: "M2" | "M" | "EACH";
  rate: string | null;
  validUntil: string | null;
  specifications: string;
  color: string;
  thicknessMm: number | null;
  processingFee: string;
  stockUnit: "PIECE" | "MM" | "MM2" | null;
};
export type DoorModel = {
  id: string;
  code: string;
  title: string;
  type: DoorType;
  active: boolean;
  version: number;
  configuration: DoorModelConfiguration;
  imageMediaId: string | null;
  imageUrl: string | null;
  imageOriginalWidth?: number | null;
  imageOriginalHeight?: number | null;
};
export type DoorMaterial = {
  imageUrl?: string | null;
  imageOriginalWidth?: number | null;
  imageOriginalHeight?: number | null;
  id: string;
  code: string;
  title: string;
  category: "GLASS" | "PROFILE" | "HARDWARE" | "SERVICE";
  active: boolean;
  version: number;
  variantId: string | null;
  configuration: DoorMaterialConfiguration;
};
export type DoorCatalog = {
  models: DoorModel[];
  materials: DoorMaterial[];
  floatingEnabled: boolean;
  settingsVersion: number;
};
/** Manufacturing dimensions are integer mm; the customer form displays cm. */
export type DoorManufacturing = {
  profileColor: "BLACK" | "WHITE" | "GOLD" | "BRONZE";
  handleSide: "RIGHT" | "LEFT" | "TOP" | "BOTTOM";
  hingeSide: "RIGHT" | "LEFT" | "TOP" | "BOTTOM";
  drillingMode: "STANDARD" | "CUSTOM";
  holes: { distanceMm: number; reference: "TOP" | "BOTTOM" }[];
};
export type DoorItemInput = {
  modelId: string;
  widthMm: number;
  heightMm: number;
  quantity: number;
  selections: { slot: string; materialId: string }[];
  manufacturing?: DoorManufacturing;
  notes: string;
};
export type DoorOrderInput = { items: DoorItemInput[] };
export type DoorPricingLine = {
  manufacturing?: DoorManufacturing;
  item: number;
  title: string;
  quantity: number;
  widthMm: number;
  heightMm: number;
  unitTotal: string | null;
  total: string | null;
  parts: {
    title: string;
    amount: string | null;
    quantityNumerator: string;
    quantityDenominator: string;
    materialId: string;
    variantId: string | null;
    unit: string;
    stockUnit: string | null;
  }[];
  model: DoorModel;
  materials: DoorMaterial[];
};
export type DoorQuoteSnapshot = {
  currency: "IRR";
  lines: DoorPricingLine[];
  reasons: string[];
  calculatedTotal: string | null;
  total: string | null;
  deposit: string | null;
  depositPolicy: DoorDepositPolicy | null;
  adjustments: { title: string; amount: string }[];
  approvalReason: string | null;
};
export type DoorQuote = {
  id: string;
  version: number;
  approved: boolean;
  snapshot: DoorQuoteSnapshot;
  createdAt: string;
};
export const DOOR_STATUSES = [
  "DRAFT",
  "PENDING_QUOTE_APPROVAL",
  "AWAITING_DEPOSIT",
  "DEPOSIT_PAID",
  "AWAITING_TECHNICAL_APPROVAL",
  "APPROVED_FOR_PRODUCTION",
  "IN_PRODUCTION",
  "QUALITY_CONTROL",
  "READY_FOR_DELIVERY",
  "AWAITING_SETTLEMENT",
  "COMPLETED",
  "CANCELLED",
] as const;
export type DoorStatus = (typeof DOOR_STATUSES)[number];
export type DoorRequirement = {
  id: string;
  quoteId: string;
  materialId: string;
  variantId: string | null;
  snapshot: DoorPricingLine["parts"][number];
  actualStockQuantity: number | null;
  reservationId: string | null;
  reservationStatus: string | null;
  consumedAt: string | null;
};
export type DoorOrderView = {
  id: string;
  commerceVersion: number;
  number: string;
  customerId: string;
  customerLabel: string;
  status: DoorStatus;
  version: number;
  technicalApproved: boolean;
  customerAcceptedQuoteVersion: number | null;
  items: DoorItemInput[];
  quote: DoorQuote;
  quotes: DoorQuote[];
  paid: string;
  remaining: string | null;
  refundableCredit: string;
  financialStatus: "UNPRICED" | "UNPAID" | "PARTIAL" | "SETTLED" | "CREDIT";
  payments: {
    id: string;
    amount: string;
    refunded: string;
    status: string;
    referenceId: string | null;
    quoteId: string | null;
    createdAt: string;
  }[];
  records: { id: string; action: string; message: string; createdAt: string }[];
  requirements: DoorRequirement[];
  attachments: { id: string; filename: string; mime: string; bytes: number }[];
  delivery: { recipient: string; address: string; tracking: string } | null;
  createdAt: string;
};
export type DoorQuoteApproval = {
  lineTotals: { total: string; reason: string }[];
  expectedVersion: number;
  total: string;
  /** Deprecated input, ignored: new quotes always require the full final amount. */
  depositPolicy?: DoorDepositPolicy;
  adjustments: { title: string; amount: string }[];
  reason: string;
};
export type DoorTransitionInput = {
  expectedVersion: number;
  status: DoorStatus;
  reason: string;
  delivery?: { recipient: string; address: string; tracking: string };
};

export const DOOR_STATUS_LABELS: Record<DoorStatus, string> = {
  DRAFT: "پیش‌نویس",
  PENDING_QUOTE_APPROVAL: "در انتظار تأیید قیمت",
  AWAITING_DEPOSIT: "در انتظار پرداخت نهایی",
  DEPOSIT_PAID: "پرداخت ثبت شد",
  AWAITING_TECHNICAL_APPROVAL: "بررسی فنی",
  APPROVED_FOR_PRODUCTION: "آماده تولید",
  IN_PRODUCTION: "در حال تولید",
  QUALITY_CONTROL: "کنترل کیفیت",
  READY_FOR_DELIVERY: "آماده تحویل",
  AWAITING_SETTLEMENT: "در انتظار تسویه",
  COMPLETED: "تکمیل شده",
  CANCELLED: "لغو شده",
};
