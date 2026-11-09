import { validateDoorManufacturing } from "./door-manufacturing";
import {
  BadRequestException,
  UnprocessableEntityException,
} from "@nestjs/common";
import type {
  DoorItemInput,
  DoorMaterial,
  DoorModel,
  DoorPricingComponent,
  DoorQuoteSnapshot,
} from "@iranyaragh/contracts";

export const MAX_DOOR_MONEY = 9223372036854775807n;
export function doorMoney(value: string): bigint {
  if (
    typeof value !== "string" ||
    !/^(0|[1-9][0-9]{0,18})$/.test(value) ||
    BigInt(value) > MAX_DOOR_MONEY
  )
    throw new BadRequestException("مبلغ باید عدد صحیح ریالی معتبر باشد.");
  return BigInt(value);
}
export function checkedMoney(value: bigint): bigint {
  if (value < 0n || value > MAX_DOOR_MONEY)
    throw new UnprocessableEntityException(
      "مبلغ محاسبه‌شده خارج از دامنه مجاز است.",
    );
  return value;
}
export function ceilDiv(n: bigint, d: bigint): bigint {
  if (n < 0n || d <= 0n)
    throw new BadRequestException("قاعده محاسبه نامعتبر است.");
  return (n + d - 1n) / d;
}
function measured(
  item: DoorItemInput,
  rule: DoorPricingComponent,
  unit: DoorMaterial["configuration"]["unit"],
) {
  const w = BigInt(item.widthMm - rule.widthDeductionMm),
    h = BigInt(item.heightMm - rule.heightDeductionMm);
  if (w <= 0n || h <= 0n)
    throw new UnprocessableEntityException(
      "ابعاد برش با قاعده مدل سازگار نیست.",
    );
  const expected =
    rule.basis === "AREA" ? "M2" : rule.basis === "FIXED" ? "EACH" : "M";
  if (unit !== expected)
    throw new UnprocessableEntityException(
      "واحد تعرفه با قاعده مدل سازگار نیست.",
    );
  let n =
    rule.basis === "AREA"
      ? w * h
      : rule.basis === "PERIMETER"
        ? 2n * (w + h)
        : rule.basis === "WIDTH"
          ? w
          : rule.basis === "HEIGHT"
            ? h
            : 1n;
  let d =
    rule.basis === "AREA" ? 1000000n : rule.basis === "FIXED" ? 1n : 1000n;
  n *= BigInt(rule.multiplier) * BigInt(10000 + rule.wasteBps);
  d *= BigInt(rule.divisor) * 10000n;
  if (!/^(0|[1-9][0-9]{0,12})(\.[0-9]{1,6})?$/.test(rule.minimumQuantity))
    throw new BadRequestException(
      "حداقل مقدار باید عدد اعشاری دقیق و مثبت باشد.",
    );
  const [whole, fraction = ""] = rule.minimumQuantity.split(".");
  const minimumD = 10n ** BigInt(fraction.length);
  const minimumN = BigInt(whole) * minimumD + BigInt(fraction || "0");
  if (n * minimumD < minimumN * d) {
    n = minimumN;
    d = minimumD;
  }
  return { n, d };
}

/** No evaluation of user expressions and no floating-point money or areas. */
export function priceDoors(
  items: DoorItemInput[],
  models: DoorModel[],
  materials: DoorMaterial[],
  now = new Date(),
): DoorQuoteSnapshot {
  if (!items.length || items.length > 50)
    throw new BadRequestException("یک تا پنجاه ردیف درب مجاز است.");
  const reasons: string[] = [];
  const materialMap = new Map(materials.map((m) => [m.id, m]));
  let calculated = 0n;
  let complete = true;
  const lines = items.map((item, index) => {
    validateDoorManufacturing(item);
    for (const value of [item.widthMm, item.heightMm, item.quantity])
      if (!Number.isSafeInteger(value) || value <= 0 || value > 2147483647)
        throw new BadRequestException(
          "ابعاد و تعداد باید عدد صحیح مثبت باشند.",
        );
    if (item.quantity > 1000)
      throw new BadRequestException("حداکثر تعداد هر ردیف هزار است.");
    const model = models.find((m) => m.id === item.modelId && m.active);
    if (!model)
      throw new UnprocessableEntityException("مدل فعال و معتبر انتخاب کنید.");
    const cfg = model.configuration;
    const prefix = `ردیف ${index + 1}: `;
    if (!cfg.technical)
      reasons.push(prefix + "قواعد فنی مدل نیازمند تکمیل و تأیید است.");
    else if (
      item.widthMm < cfg.technical.minWidthMm ||
      item.widthMm > cfg.technical.maxWidthMm ||
      item.heightMm < cfg.technical.minHeightMm ||
      item.heightMm > cfg.technical.maxHeightMm
    )
      reasons.push(
        prefix + "ابعاد نیازمند تأیید فنی خارج از محدوده ثبت‌شده است.",
      );
    if (cfg.manualApproval)
      reasons.push(prefix + "تأیید مدیر برای این مدل الزامی است.");
    const selected = new Map(
      item.selections.map((s) => [s.slot, s.materialId]),
    );
    if (
      selected.size !== item.selections.length ||
      item.selections.some(
        (s) => !cfg.slots.some((slot) => slot.key === s.slot),
      )
    )
      throw new UnprocessableEntityException(
        "گزینه تکراری یا ناشناخته ارسال شده است.",
      );
    const chosen: DoorMaterial[] = [];
    for (const slot of cfg.slots) {
      const id = selected.get(slot.key);
      if (!id && !slot.required) continue;
      const material = id ? materialMap.get(id) : null;
      if (!id || !slot.materialIds.includes(id) || !material?.active)
        throw new UnprocessableEntityException(
          `گزینه معتبر برای ${slot.title} انتخاب کنید.`,
        );
      chosen.push(material);
    }
    for (const rule of cfg.incompatible)
      if (rule.materialIds.every((id) => chosen.some((m) => m.id === id)))
        throw new UnprocessableEntityException(rule.reason);
    let unit = 0n;
    let lineComplete = true;
    if (!cfg.components.length || !cfg.labor) {
      reasons.push(prefix + "فرمول یا اجرت کامل نیست.");
      lineComplete = false;
    }
    const parts: DoorQuoteSnapshot["lines"][number]["parts"] = [];
    for (const component of cfg.components) {
      const id = selected.get(component.slot);
      if (!id) continue;
      const material = materialMap.get(id)!;
      const { n, d } = measured(item, component, material.configuration.unit);
      const rate = material.configuration.rate;
      const expired =
        material.configuration.validUntil !== null &&
        new Date(material.configuration.validUntil) <= now;
      const amount =
        rate === null || expired
          ? null
          : checkedMoney(
              ceilDiv(n * doorMoney(rate), d) +
                doorMoney(material.configuration.processingFee),
            );
      if (amount === null) {
        reasons.push(prefix + `تعرفه ${material.title} موجود یا معتبر نیست.`);
        lineComplete = false;
      } else unit += amount;
      parts.push({
        title: material.title,
        amount: amount?.toString() ?? null,
        quantityNumerator: (n * BigInt(item.quantity)).toString(),
        quantityDenominator: d.toString(),
        materialId: material.id,
        variantId: material.variantId,
        unit: material.configuration.unit,
        stockUnit: material.configuration.stockUnit,
      });
    }
    for (const material of chosen)
      if (!parts.some((p) => p.materialId === material.id)) {
        reasons.push(prefix + `قاعده محاسبه ${material.title} تعیین نشده است.`);
        lineComplete = false;
      }
    if (cfg.labor)
      unit +=
        doorMoney(cfg.labor.fixed) +
        ceilDiv(
          BigInt(item.widthMm) *
            BigInt(item.heightMm) *
            doorMoney(cfg.labor.perSquareMeter),
          1000000n,
        );
    for (const extra of cfg.additional) unit += doorMoney(extra.amount);
    unit += ceilDiv(unit * BigInt(cfg.taxBps), 10000n);
    const discount = doorMoney(cfg.discount);
    if (discount > unit)
      throw new UnprocessableEntityException("تخفیف از مبلغ ردیف بیشتر است.");
    unit -= discount;
    if (unit < doorMoney(cfg.minimumTotal)) unit = doorMoney(cfg.minimumTotal);
    checkedMoney(unit);
    const total = checkedMoney(unit * BigInt(item.quantity));
    if (lineComplete) calculated = checkedMoney(calculated + total);
    else complete = false;
    return {
      item: index,
      title: model.title,
      ...(item.manufacturing
        ? { manufacturing: structuredClone(item.manufacturing) }
        : {}),
      quantity: item.quantity,
      widthMm: item.widthMm,
      heightMm: item.heightMm,
      unitTotal: lineComplete ? unit.toString() : null,
      total: lineComplete ? total.toString() : null,
      parts,
      model,
      materials: chosen,
    };
  });
  const approved = complete && reasons.length === 0;
  return {
    currency: "IRR",
    lines,
    reasons,
    calculatedTotal: complete ? calculated.toString() : null,
    total: approved ? calculated.toString() : null,
    adjustments: [],
    approvalReason: null,
  };
}

/** Historical rows may carry deposit terms; they stay stored but are never served. */
export function withoutLegacyDeposit<T extends object>(value: T): T {
  const copy = { ...value } as Record<string, unknown>;
  delete copy.deposit;
  delete copy.depositPolicy;
  return copy as T;
}

export function doorPaid(
  payments: { status: string; amount: bigint; refundedAmount: bigint }[],
): bigint {
  return payments.reduce(
    (n, p) =>
      n +
      (["PAID", "PARTIALLY_REFUNDED", "REFUNDED"].includes(p.status)
        ? p.amount - p.refundedAmount
        : 0n),
    0n,
  );
}
