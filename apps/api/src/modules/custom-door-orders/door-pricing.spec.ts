import { describe, expect, it } from "vitest";
import { depositFor, doorPaid, priceDoors } from "./door-pricing";
import { assertDoorTransition, DOOR_STATUSES } from "./door-state";
import { DOOR_STATUSES as CONTRACT_DOOR_STATUSES } from "@iranyaragh/contracts";
import { DoorOrderDto, normalizeDoorDigits } from "./door.dto";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";

import { pricingFixture } from "./door.test-fixtures";
describe("Custom door pricing (integer IRR / rational measurement)", () => {
  it("prices real cut area, profile perimeter, hardware and both labor terms", () => {
    const f = pricingFixture();
    const q = priceDoors([f.item], f.models, f.materials);
    expect(q.lines[0].parts.map((p) => p.amount)).toEqual([
      "5001",
      "6000",
      "6000",
    ]);
    expect(q.total).toBe("19001");
    expect(q.deposit).toBe("5701");
  });
  it("aggregates different doors and per-model fixed/percent deposit policies", () => {
    const f = pricingFixture();
    const b = structuredClone(f.model);
    b.id = "model-b";
    b.configuration.deposit = { kind: "FIXED", value: "500", minimum: "800" };
    const q = priceDoors(
      [
        { ...f.item, quantity: 2 },
        { ...f.item, modelId: b.id, widthMm: 1000 },
      ],
      [...f.models, b],
      f.materials,
    );
    expect(q.lines.map((l) => l.total)).toEqual(["38002", "27001"]);
    expect(q.total).toBe("65003");
    expect(q.deposit).toBe("12201");
  });
  it("applies cut deductions, waste, minimum area and processing fees", () => {
    const f = pricingFixture();
    f.cfg.components[0] = {
      ...f.cfg.components[0],
      widthDeductionMm: 100,
      heightDeductionMm: 100,
      wasteBps: 1000,
      minimumQuantity: "1",
    };
    f.materials[0].configuration.processingFee = "50";
    const q = priceDoors([f.item], f.models, f.materials);
    expect(q.lines[0].parts[0].amount).toBe("10051");
  });
  it("supports exact fractional minimum billable areas", () => {
    const f = pricingFixture();
    f.cfg.components[0].minimumQuantity = "0.75";
    expect(
      priceDoors([f.item], f.models, f.materials).lines[0].parts[0].amount,
    ).toBe("7501");
  });
  it("supports rational coefficients without double rounding", () => {
    const f = pricingFixture();
    f.cfg.components[0].divisor = 3;
    f.materials[0].configuration.rate = "9007199254740993";
    expect(
      priceDoors([f.item], f.models, f.materials).lines[0].parts[0].amount,
    ).toBe("1501199875790166");
  });
  it("applies taxes, discounts and per-door minimum price", () => {
    const f = pricingFixture();
    f.cfg.taxBps = 1000;
    f.cfg.discount = "100";
    f.cfg.minimumTotal = "30000";
    expect(
      priceDoors([{ ...f.item, quantity: 2 }], f.models, f.materials).total,
    ).toBe("60000");
  });
  it.each(["technical", "labor", "deposit"] as const)(
    "routes an incomplete %s policy to approval",
    (key) => {
      const f = pricingFixture();
      f.cfg[key] = null;
      const q = priceDoors([f.item], f.models, f.materials);
      expect(q.total).toBeNull();
      expect(q.deposit).toBeNull();
      expect(q.reasons.length).toBeGreaterThan(0);
    },
  );
  it("routes missing/expired rates and special/out-of-range models to approval", () => {
    const f = pricingFixture();
    f.materials[0].configuration.rate = null;
    expect(
      priceDoors([f.item], f.models, f.materials).calculatedTotal,
    ).toBeNull();
    f.materials[0].configuration.rate = "1000";
    f.materials[0].configuration.validUntil = "2000-01-01T00:00:00Z";
    expect(priceDoors([f.item], f.models, f.materials).total).toBeNull();
    f.materials[0].configuration.validUntil = null;
    f.cfg.manualApproval = true;
    expect(priceDoors([f.item], f.models, f.materials).total).toBeNull();
    f.cfg.manualApproval = false;
    expect(
      priceDoors([{ ...f.item, widthMm: 4000 }], f.models, f.materials).total,
    ).toBeNull();
  });
  it("rejects tampered selections, inactive models, duplicate and incompatible options", () => {
    const f = pricingFixture();
    expect(() =>
      priceDoors(
        [{ ...f.item, selections: [{ slot: "fake", materialId: "glass" }] }],
        f.models,
        f.materials,
      ),
    ).toThrow();
    expect(() =>
      priceDoors(
        [
          {
            ...f.item,
            selections: [...f.item.selections, f.item.selections[0]],
          },
        ],
        f.models,
        f.materials,
      ),
    ).toThrow();
    f.cfg.incompatible = [
      { materialIds: ["glass", "profile"], reason: "TEST INCOMPATIBLE" },
    ];
    expect(() => priceDoors([f.item], f.models, f.materials)).toThrow(
      "TEST INCOMPATIBLE",
    );
    f.model.active = false;
    expect(() => priceDoors([f.item], f.models, f.materials)).toThrow();
  });
  it("rejects non-integer/negative dimensions, unit mismatches and money overflow", () => {
    const f = pricingFixture();
    for (const widthMm of [0, -1, 0.5, Infinity])
      expect(() =>
        priceDoors([{ ...f.item, widthMm }], f.models, f.materials),
      ).toThrow();
    f.materials[0].configuration.unit = "EACH";
    expect(() => priceDoors([f.item], f.models, f.materials)).toThrow();
    f.materials[0].configuration.unit = "M2";
    f.materials[0].configuration.rate = "9223372036854775807";
    expect(() =>
      priceDoors([{ ...f.item, quantity: 1000 }], f.models, f.materials),
    ).toThrow();
  });
  it("holds immutable snapshots when later rates change", () => {
    const f = pricingFixture();
    const q = structuredClone(priceDoors([f.item], f.models, f.materials));
    f.materials[0].configuration.rate = "50000";
    expect(q.total).toBe("19001");
    expect(priceDoors([f.item], f.models, f.materials).total).not.toBe(q.total);
  });
  it("caps deposits by total, respects minimum and rejects invalid percentages", () => {
    expect(
      depositFor(100n, { kind: "FIXED", value: "500", minimum: "0" }),
    ).toBe(100n);
    expect(
      depositFor(100n, { kind: "PERCENT", value: "1000", minimum: "200" }),
    ).toBe(100n);
    expect(() =>
      depositFor(100n, { kind: "PERCENT", value: "10001", minimum: "0" }),
    ).toThrow();
    expect(
      doorPaid([
        { status: "PENDING", amount: 100n, refundedAmount: 0n },
        { status: "PARTIALLY_REFUNDED", amount: 200n, refundedAmount: 30n },
      ]),
    ).toBe(170n);
  });
  it("normalizes Persian/Arabic digits at the API boundary and rejects client prices", async () => {
    expect(normalizeDoorDigits("۱۲٣")).toBe(123);
    const f = pricingFixture();
    const dto = plainToInstance(DoorOrderDto, {
      items: [
        {
          ...f.item,
          widthMm: "۵۰۰",
          heightMm: "۱۰۰۰",
          quantity: "۲",
          unitPrice: "1",
        },
      ],
    });
    expect(dto.items[0].widthMm).toBe(500);
    expect(
      await validate(dto, { whitelist: true, forbidNonWhitelisted: true }),
    ).not.toHaveLength(0);
  });
});
describe("Production/financial separation", () => {
  it("keeps the generated runtime enum identical to the shared API contract", () => {
    expect(DOOR_STATUSES).toEqual(CONTRACT_DOOR_STATUSES);
  });
  const context = {
    approved: true,
    accepted: true,
    paid: 100n,
    deposit: 30n,
    remaining: 0n,
    technical: true,
    stockReady: true,
    consumed: true,
    delivery: true,
  };
  it("blocks production without technical approval or real stock plan", () => {
    expect(() =>
      assertDoorTransition("APPROVED_FOR_PRODUCTION", "IN_PRODUCTION", {
        ...context,
        technical: false,
      }),
    ).toThrow();
    expect(() =>
      assertDoorTransition("APPROVED_FOR_PRODUCTION", "IN_PRODUCTION", {
        ...context,
        stockReady: false,
      }),
    ).toThrow();
    expect(() =>
      assertDoorTransition(
        "AWAITING_TECHNICAL_APPROVAL",
        "APPROVED_FOR_PRODUCTION",
        { ...context, paid: 0n },
      ),
    ).toThrow();
  });
  it("blocks delivery/completion before consumption, settlement or delivery evidence", () => {
    expect(() =>
      assertDoorTransition("IN_PRODUCTION", "QUALITY_CONTROL", {
        ...context,
        consumed: false,
      }),
    ).toThrow();
    expect(() =>
      assertDoorTransition("AWAITING_SETTLEMENT", "COMPLETED", {
        ...context,
        remaining: 1n,
      }),
    ).toThrow();
    expect(() =>
      assertDoorTransition("AWAITING_SETTLEMENT", "COMPLETED", {
        ...context,
        delivery: false,
      }),
    ).toThrow();
    expect(() =>
      assertDoorTransition("IN_PRODUCTION", "CANCELLED", context),
    ).toThrow();
    expect(() =>
      assertDoorTransition("AWAITING_SETTLEMENT", "COMPLETED", context),
    ).not.toThrow();
  });
});
