import type {
  DoorItemInput,
  DoorMaterial,
  DoorModel,
  DoorModelConfiguration,
} from "@iranyaragh/contracts";
/** Isolated arithmetic fixtures; never production models or technical limits. */
export function pricingFixture() {
  const materials: DoorMaterial[] = [
    ["glass", "GLASS", "M2", "10001"],
    ["profile", "PROFILE", "M", "2000"],
    ["hinge", "HARDWARE", "EACH", "3000"],
  ].map(([id, category, unit, rate]) => ({
    id,
    code: `fixture-${id}`,
    title: `TEST ONLY ${id}`,
    category: category as DoorMaterial["category"],
    active: true,
    version: 1,
    variantId: null,
    configuration: {
      unit: unit as DoorMaterial["configuration"]["unit"],
      rate,
      validUntil: null,
      specifications: "TEST ONLY",
      color: "",
      thicknessMm: null,
      processingFee: "0",
      stockUnit: null,
    },
  }));
  const cfg: DoorModelConfiguration = {
    technical: {
      minWidthMm: 100,
      maxWidthMm: 3000,
      minHeightMm: 100,
      maxHeightMm: 3000,
      toleranceMm: 0,
    },
    manualApproval: false,
    slots: materials.map((m) => ({
      key: m.id,
      title: m.title,
      materialIds: [m.id],
      required: true,
    })),
    incompatible: [],
    components: materials.map((m) => ({
      slot: m.id,
      basis:
        m.id === "glass" ? "AREA" : m.id === "profile" ? "PERIMETER" : "FIXED",
      multiplier: m.id === "hinge" ? 2 : 1,
      divisor: 1,
      widthDeductionMm: 0,
      heightDeductionMm: 0,
      wasteBps: 0,
      minimumQuantity: "0",
    })),
    labor: { fixed: "1000", perSquareMeter: "2000" },
    additional: [],
    taxBps: 0,
    discount: "0",
    minimumTotal: "0",
  };
  const model: DoorModel = {
    id: "model",
    code: "fixture-model",
    title: "TEST ONLY MODEL",
    type: "FORMLEX",
    active: true,
    version: 1,
    configuration: cfg,
    imageMediaId: null,
    imageUrl: null,
  };
  const item: DoorItemInput = {
    modelId: model.id,
    widthMm: 500,
    heightMm: 1000,
    quantity: 1,
    selections: materials.map((m) => ({ slot: m.id, materialId: m.id })),
    notes: "",
  };
  return { model, models: [model], materials, item, cfg };
}
