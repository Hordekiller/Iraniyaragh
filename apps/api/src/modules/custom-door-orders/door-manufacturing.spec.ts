import { describe, expect, it } from "vitest";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import type { DoorItemInput, DoorManufacturing } from "@iranyaragh/contracts";
import { validateDoorManufacturing } from "./door-manufacturing";
import { DoorItemDto } from "./door.dto";
import { priceDoors } from "./door-pricing";
import { pricingFixture } from "./door.test-fixtures";

const custom = (): DoorManufacturing => ({
  profileColor: "BRONZE",
  handleSide: "LEFT",
  hingeSide: "RIGHT",
  drillingMode: "CUSTOM",
  holes: [120, 710, 1290, 1880].map((distanceMm) => ({
    distanceMm,
    reference: "TOP",
  })),
});
const item = (manufacturing?: DoorManufacturing): DoorItemInput => ({
  modelId: "m",
  widthMm: 800,
  heightMm: 2000,
  quantity: 1,
  selections: [],
  notes: "",
  ...(manufacturing ? { manufacturing } : {}),
});
describe("door manufacturing validation", () => {
  it("accepts old orders and leaves standard drilling to the store without invented positions", () => {
    expect(() => validateDoorManufacturing(item())).not.toThrow();
    expect(() =>
      validateDoorManufacturing(
        item({ ...custom(), drillingMode: "STANDARD", holes: [] }),
      ),
    ).not.toThrow();
  });
  it("accepts both reference edges and the door height boundary", () => {
    const value = custom();
    value.holes[3] = { distanceMm: 2000, reference: "BOTTOM" };
    expect(() => validateDoorManufacturing(item(value))).not.toThrow();
  });
  it.each([0, -1, 2001, 12.5, NaN, Infinity])(
    "rejects invalid distance %s",
    (distanceMm) => {
      const value = custom();
      value.holes[0].distanceMm = distanceMm;
      expect(() => validateDoorManufacturing(item(value))).toThrow();
    },
  );
  it("rechecks positions after the door height changes", () => {
    expect(() =>
      validateDoorManufacturing({ ...item(custom()), heightMm: 1800 }),
    ).toThrow();
  });
  it("rejects duplicate physical positions with different references", () => {
    const value = custom();
    value.holes[3] = { distanceMm: 1880, reference: "BOTTOM" };
    expect(() => validateDoorManufacturing(item(value))).toThrow(/یکسان/);
  });
  it("requires exactly four custom positions and rejects hidden custom positions in standard mode", () => {
    expect(() =>
      validateDoorManufacturing(item({ ...custom(), holes: [] })),
    ).toThrow();
    expect(() =>
      validateDoorManufacturing(
        item({ ...custom(), drillingMode: "STANDARD" }),
      ),
    ).toThrow();
  });
  it("rejects nulls, unknown colors/directions and extra hole properties at the HTTP boundary", () => {
    for (const value of [
      null,
      { ...custom(), profileColor: "RED" },
      { ...custom(), handleSide: "invalid" },
      { ...custom(), holes: [{ distanceMm: 10, reference: "SIDE" }] },
      {
        ...custom(),
        holes: [{ distanceMm: 10, reference: "TOP", tampered: true }],
      },
    ]) {
      const dto = plainToInstance(DoorItemDto, {
        ...item(),
        manufacturing: value,
      });
      expect(
        validateSync(dto, { whitelist: true, forbidNonWhitelisted: true }),
      ).not.toHaveLength(0);
    }
  });
  it("copies manufacturing into the immutable quote without changing prices", () => {
    const f = pricingFixture();
    f.item.heightMm = 2000;
    const before = priceDoors([f.item], [f.model], f.materials);
    const value = custom();
    const after = priceDoors(
      [{ ...f.item, manufacturing: value }],
      [f.model],
      f.materials,
    );
    expect(after.calculatedTotal).toBe(before.calculatedTotal);
    expect(after.lines[0].manufacturing).toEqual(value);
    value.holes[0].distanceMm = 999;
    expect(after.lines[0].manufacturing?.holes[0].distanceMm).toBe(120);
    expect(() =>
      priceDoors(
        [{ ...f.item, manufacturing: { ...custom(), holes: [] } }],
        [f.model],
        f.materials,
      ),
    ).toThrow();
  });
});
