import { ConflictException } from "@nestjs/common";
import { DoorProductionStatus } from "@prisma/client";
import type { DoorStatus } from "@iranyaragh/contracts";
import { assertTransition } from "../../common/state-machine";

// Contracts ship TypeScript types for consumers, not executable Node modules.
// Runtime validation uses the generated database enum; the contract checks its values.
export const DOOR_STATUSES = Object.values(
  DoorProductionStatus,
) satisfies DoorStatus[];

export const DOOR_TRANSITIONS: Record<DoorStatus, ReadonlySet<DoorStatus>> = {
  DRAFT: new Set(["PENDING_QUOTE_APPROVAL", "AWAITING_DEPOSIT", "CANCELLED"]),
  PENDING_QUOTE_APPROVAL: new Set(["AWAITING_DEPOSIT", "CANCELLED"]),
  AWAITING_DEPOSIT: new Set(["DEPOSIT_PAID", "CANCELLED"]),
  DEPOSIT_PAID: new Set(["AWAITING_TECHNICAL_APPROVAL", "CANCELLED"]),
  AWAITING_TECHNICAL_APPROVAL: new Set([
    "APPROVED_FOR_PRODUCTION",
    "CANCELLED",
  ]),
  APPROVED_FOR_PRODUCTION: new Set(["IN_PRODUCTION", "CANCELLED"]),
  IN_PRODUCTION: new Set(["QUALITY_CONTROL"]),
  QUALITY_CONTROL: new Set(["IN_PRODUCTION", "READY_FOR_DELIVERY"]),
  READY_FOR_DELIVERY: new Set(["AWAITING_SETTLEMENT", "COMPLETED"]),
  AWAITING_SETTLEMENT: new Set(["COMPLETED"]),
  COMPLETED: new Set(),
  CANCELLED: new Set(),
};
export function assertDoorTransition(
  from: DoorStatus,
  to: DoorStatus,
  context: {
    approved: boolean;
    accepted: boolean;
    paid: bigint;
    deposit: bigint;
    remaining: bigint;
    technical: boolean;
    stockReady: boolean;
    consumed: boolean;
    delivery: boolean;
  },
) {
  assertTransition(from, to, DOOR_TRANSITIONS);
  const fail = (message: string): never => {
    throw new ConflictException({ code: "DOOR_STATE_CONFLICT", message });
  };
  if (to === "CANCELLED") return;
  if (!context.approved || !context.accepted)
    fail("قیمت قطعی و تأیید مشخصات توسط مشتری لازم است.");
  if (context.paid < context.deposit)
    fail("بیعانه معتبر سفارش دریافت نشده است.");
  if (
    [
      "APPROVED_FOR_PRODUCTION",
      "IN_PRODUCTION",
      "QUALITY_CONTROL",
      "READY_FOR_DELIVERY",
      "AWAITING_SETTLEMENT",
      "COMPLETED",
    ].includes(to) &&
    !context.technical
  )
    fail("تأیید فنی پیش از تولید لازم است.");
  if (to === "IN_PRODUCTION" && !context.stockReady)
    fail("قطعات متصل به انبار باید طبق برنامه مصرف واقعی رزرو شوند.");
  if (
    ["QUALITY_CONTROL", "READY_FOR_DELIVERY", "COMPLETED"].includes(to) &&
    !context.consumed
  )
    fail("ثبت مصرف واقعی قطعات لازم است.");
  if (to === "COMPLETED" && (context.remaining !== 0n || !context.delivery))
    fail("تسویه کامل و اطلاعات تحویل لازم است.");
}
