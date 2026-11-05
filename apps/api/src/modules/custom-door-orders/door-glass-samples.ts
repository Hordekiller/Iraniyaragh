import type { DoorGlassSampleKey } from "@iranyaragh/contracts";

// Contracts export unbuilt TypeScript; compiled Node must use local runtime values.
// Exhaustive typing and the contract test keep validation and UI choices aligned.
export const DOOR_GLASS_SAMPLE_ENUM = {
  "clear": "clear",
  "frosted": "frosted",
  "white": "white",
  "cream": "cream",
  "light-smoke": "light-smoke",
  "dark-smoke": "dark-smoke",
  "black": "black",
  "bronze": "bronze",
  "amber": "amber",
  "brown": "brown",
  "light-green": "light-green",
  "green": "green",
  "light-blue": "light-blue",
  "navy": "navy",
  "red": "red",
  "pink": "pink",
} as const satisfies Record<DoorGlassSampleKey, DoorGlassSampleKey>;

export const DOOR_GLASS_SAMPLE_KEYS = Object.values(DOOR_GLASS_SAMPLE_ENUM);
