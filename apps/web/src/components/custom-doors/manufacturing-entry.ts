import {
  type DoorManufacturing,
} from "@iranyaragh/contracts";
import { doorDigits } from "../../services/custom-doors/api";

export type ManufacturingEntry = {
  profileColor: DoorManufacturing["profileColor"] | "";
  handleSide: DoorManufacturing["handleSide"] | "";
  hingeSide: DoorManufacturing["hingeSide"] | "";
  drillingMode: DoorManufacturing["drillingMode"];
  holes: { distance: string; reference: "TOP" | "BOTTOM" }[];
};
export const emptyManufacturing = (): ManufacturingEntry => ({
  profileColor: "",
  handleSide: "",
  hingeSide: "",
  drillingMode: "STANDARD",
  holes: Array.from({ length: 4 }, () => ({ distance: "", reference: "TOP" })),
});
export function manufacturingEntry(
  value?: DoorManufacturing,
): ManufacturingEntry {
  if (!value) return emptyManufacturing();
  return {
    ...value,
    holes:
      value.drillingMode === "CUSTOM"
        ? value.holes.map((hole) => ({
            distance: String(hole.distanceMm / 10),
            reference: hole.reference,
          }))
        : emptyManufacturing().holes,
  };
}
const cmToMm = (value: string) => {
  const normalized = doorDigits(value)
    .trim()
    .replace("٫", ".")
    .replace("،", ".");
  if (!/^\d+(?:\.\d)?$/.test(normalized)) return NaN;
  const [whole, fraction = "0"] = normalized.split(".");
  return Number(whole) * 10 + Number(fraction);
};
export function readManufacturing(
  value: ManufacturingEntry,
  heightMm: number,
): DoorManufacturing {
  if (!value.profileColor || !value.handleSide || !value.hingeSide)
    throw new Error(
      "رنگ پروفیل، سمت دستگیره و محل گازور / لولا را انتخاب کنید.",
    );
  const holes =
    value.drillingMode === "CUSTOM"
      ? value.holes.map((hole) => ({
          distanceMm: cmToMm(hole.distance),
          reference: hole.reference,
        }))
      : [];
  const positions = new Set<number>();
  for (const hole of holes) {
    if (
      !Number.isSafeInteger(hole.distanceMm) ||
      hole.distanceMm <= 0 ||
      hole.distanceMm > heightMm
    )
      throw new Error(
        "فاصلهٔ هر سوراخ باید مثبت، با دقت حداکثر یک‌دهم سانت و حداکثر برابر ارتفاع درب باشد.",
      );
    const top =
      hole.reference === "TOP" ? hole.distanceMm : heightMm - hole.distanceMm;
    if (positions.has(top))
      throw new Error(
        "محل دو سوراخ نمی‌تواند یکسان باشد؛ مرجع بالا و پایین را بررسی کنید.",
      );
    positions.add(top);
  }
  return {
    ...value,
    profileColor: value.profileColor,
    handleSide: value.handleSide,
    hingeSide: value.hingeSide,
    holes,
  };
}
