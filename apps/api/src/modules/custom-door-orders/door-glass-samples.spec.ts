import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { describe, expect, it } from "vitest";
import { DOOR_GLASS_SAMPLES } from "@iranyaragh/contracts";
import { DOOR_GLASS_SAMPLE_KEYS } from "./door-glass-samples";
import { DoorMaterialConfigurationDto } from "./door.dto";

const configuration = {
  unit: "M2", rate: "100000000", validUntil: null, specifications: "test",
  color: "test", thicknessMm: 4, processingFee: "0", stockUnit: null,
};
const errors = (sampleKey: unknown) => validateSync(plainToInstance(
  DoorMaterialConfigurationDto, { ...configuration, sampleKey },
), { whitelist: true, forbidNonWhitelisted: true });

describe("compiled API glass sample contract", () => {
  it("keeps local runtime validation aligned with all UI sample keys", () => {
    expect(DOOR_GLASS_SAMPLE_KEYS).toEqual(DOOR_GLASS_SAMPLES.map(sample => sample.key));
    for (const key of DOOR_GLASS_SAMPLE_KEYS) expect(errors(key)).toEqual([]);
  });
  it("accepts absent/cleared samples and rejects unknown or non-string choices", () => {
    expect(errors(undefined)).toEqual([]);
    expect(errors(null)).toEqual([]);
    for (const value of ["unknown", "", 4, {}, ["clear"]]) {
      expect(errors(value).some(error => error.property === "sampleKey")).toBe(true);
    }
  });
});
