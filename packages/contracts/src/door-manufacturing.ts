import type { DoorManufacturing } from "./custom-doors";
export const DOOR_PROFILE_COLORS = {
  BLACK: "مشکی",
  WHITE: "سفید",
  GOLD: "طلایی",
  BRONZE: "برنز",
} as const;
export const DOOR_SIDES = {
  RIGHT: "راست",
  LEFT: "چپ",
  TOP: "بالا",
  BOTTOM: "پایین",
} as const;
/** Used by both customer and operations screens, including historical quote snapshots. */
export function doorManufacturingSummary(value?: DoorManufacturing): string[] {
  if (!value) return [];
  return [
    `رنگ پروفیل: ${DOOR_PROFILE_COLORS[value.profileColor]}`,
    `سمت دستگیره: ${DOOR_SIDES[value.handleSide]}`,
    `محل گازور / لولا: ${DOOR_SIDES[value.hingeSide]}`,
    `حالت سوراخ‌کاری: ${value.drillingMode === "STANDARD" ? "استاندارد" : "سفارشی"}`,
    ...value.holes.map(
      (hole, index) =>
        `سوراخ ${(index + 1).toLocaleString("fa-IR")}: ${(hole.distanceMm / 10).toLocaleString("fa-IR")} سانت از ${hole.reference === "TOP" ? "بالا" : "پایین"}`,
    ),
  ];
}
