import { BadRequestException } from "@nestjs/common";
import type { DoorItemInput } from "@iranyaragh/contracts";

/** Rechecked for preview, create and draft replacement, including internal callers. */
export function validateDoorManufacturing(item: DoorItemInput): void {
  const value = item.manufacturing;
  if (value === undefined) return; // Historical orders/clients did not collect these fields.
  const fail = (message: string): never => {
    throw new BadRequestException(message);
  };
  if (
    !value ||
    !["BLACK", "WHITE", "GOLD", "BRONZE"].includes(value.profileColor) ||
    !["RIGHT", "LEFT", "TOP", "BOTTOM"].includes(value.handleSide) ||
    !["RIGHT", "LEFT", "TOP", "BOTTOM"].includes(value.hingeSide) ||
    !["STANDARD", "CUSTOM"].includes(value.drillingMode) ||
    !Array.isArray(value.holes)
  )
    fail("مشخصات پروفیل، دستگیره و لولا معتبر نیست.");
  if (value.drillingMode === "STANDARD") {
    if (value.holes.length !== 0)
      fail("در حالت استاندارد، محل سوراخ سفارشی نباید ثبت شود.");
    return;
  }
  if (value.holes.length !== 4)
    fail("برای سوراخ‌کاری سفارشی، محل هر چهار سوراخ را وارد کنید.");
  const positions = new Set<number>();
  for (const hole of value.holes) {
    if (
      !hole ||
      !Number.isSafeInteger(hole.distanceMm) ||
      hole.distanceMm <= 0 ||
      hole.distanceMm > item.heightMm ||
      !["TOP", "BOTTOM"].includes(hole.reference)
    ) {
      fail("فاصلهٔ سوراخ باید مثبت و حداکثر برابر ارتفاع درب باشد.");
    }
    const top =
      hole.reference === "TOP"
        ? hole.distanceMm
        : item.heightMm - hole.distanceMm;
    if (positions.has(top))
      fail(
        "محل دو سوراخ نمی‌تواند یکسان باشد؛ مرجع بالا و پایین را بررسی کنید.",
      );
    positions.add(top);
  }
}
