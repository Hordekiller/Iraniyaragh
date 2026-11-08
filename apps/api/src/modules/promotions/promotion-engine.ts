/**
 * Pure, deterministic promotion pricing. Integer IRR (`bigint`) arithmetic only;
 * percentages round half-up exactly once per promotion. No I/O: eligibility that
 * needs the database (dates, usage, customer) is resolved by the caller.
 */
export type EngineKind = 'PERCENTAGE' | 'FIXED_CART' | 'FIXED_ITEM' | 'FREE_SHIPPING';
export type EngineTarget = { type: 'PRODUCT' | 'VARIANT' | 'CATEGORY' | 'BRAND'; targetId: string; exclude: boolean };

export type EngineLine = {
  variantId: string;
  productId: string;
  /** The line's category and all its ancestors. */
  categoryIds: string[];
  brandId: string | null;
  unitPrice: bigint;
  quantity: number;
};

export type EnginePromotion = {
  id: string;
  couponId: string | null;
  name: string;
  kind: EngineKind;
  percentBp: number | null;
  amount: bigint | null;
  maxDiscount: bigint | null;
  minOrder: bigint | null;
  maxOrder: bigint | null;
  stackable: boolean;
  priority: number;
  targets: EngineTarget[];
};

export type LineAllocation = { variantId: string; amount: bigint };
export type AppliedPromotion = {
  promotionId: string;
  couponId: string | null;
  name: string;
  kind: EngineKind;
  itemDiscount: bigint;
  shippingDiscount: bigint;
  allocations: LineAllocation[];
};
export type EngineResult = {
  applied: AppliedPromotion[];
  itemDiscount: bigint;
  shippingDiscount: bigint;
  totalDiscount: bigint;
};

export type RejectionReason = 'MIN_ORDER' | 'MAX_ORDER' | 'NOT_APPLICABLE';

export function lineEligible(line: EngineLine, targets: EngineTarget[]): boolean {
  const matches = (t: EngineTarget) =>
    (t.type === 'PRODUCT' && t.targetId === line.productId) ||
    (t.type === 'VARIANT' && t.targetId === line.variantId) ||
    (t.type === 'CATEGORY' && line.categoryIds.includes(t.targetId)) ||
    (t.type === 'BRAND' && line.brandId !== null && t.targetId === line.brandId);
  if (targets.some((t) => t.exclude && matches(t))) return false;
  const includes = targets.filter((t) => !t.exclude);
  return includes.length === 0 || includes.some(matches);
}

const gross = (l: EngineLine) => l.unitPrice * BigInt(l.quantity);
const min = (a: bigint, b: bigint) => (a < b ? a : b);

function distribute(total: bigint, remaining: bigint[], eligible: number[]): bigint[] {
  const base = eligible.reduce((s, i) => s + remaining[i]!, 0n);
  const out = remaining.map(() => 0n);
  if (total <= 0n || base <= 0n) return out;
  const rems: { i: number; r: bigint }[] = [];
  let given = 0n;
  for (const i of eligible) {
    const share = (total * remaining[i]!) / base;
    out[i] = share;
    given += share;
    rems.push({ i, r: (total * remaining[i]!) % base });
  }
  rems.sort((a, b) => (a.r === b.r ? a.i - b.i : a.r > b.r ? -1 : 1));
  let left = total - given;
  for (const { i } of rems) {
    if (left === 0n) break;
    if (out[i]! < remaining[i]!) {
      out[i]! += 1n;
      left -= 1n;
    }
  }
  return out;
}

type State = { remaining: bigint[]; shipping: bigint };

function applyOne(
  promo: EnginePromotion,
  lines: EngineLine[],
  state: State,
  orderValue: bigint,
): AppliedPromotion | null {
  if (promo.minOrder !== null && orderValue < promo.minOrder) return null;
  if (promo.maxOrder !== null && orderValue > promo.maxOrder) return null;
  const eligible = lines.map((l, i) => (lineEligible(l, promo.targets) ? i : -1)).filter((i) => i >= 0);
  const alloc = lines.map(() => 0n);
  let item = 0n;
  let ship = 0n;
  const eligibleTotal = eligible.reduce((s, i) => s + state.remaining[i]!, 0n);
  if (promo.kind === 'FREE_SHIPPING') {
    ship = state.shipping;
    if (promo.maxDiscount !== null) ship = min(ship, promo.maxDiscount);
  } else if (promo.kind === 'FIXED_ITEM') {
    for (const i of eligible) {
      let d = (promo.amount ?? 0n) * BigInt(lines[i]!.quantity);
      d = min(d, state.remaining[i]!);
      alloc[i] = d;
      item += d;
    }
    if (promo.maxDiscount !== null && item > promo.maxDiscount) {
      const capped = distribute(promo.maxDiscount, alloc, eligible);
      capped.forEach((v, i) => (alloc[i] = v));
      item = promo.maxDiscount;
    }
  } else {
    let total =
      promo.kind === 'PERCENTAGE'
        ? (eligibleTotal * BigInt(promo.percentBp ?? 0) + 5000n) / 10000n
        : (promo.amount ?? 0n);
    if (promo.maxDiscount !== null) total = min(total, promo.maxDiscount);
    total = min(total, eligibleTotal);
    distribute(total, state.remaining, eligible).forEach((v, i) => (alloc[i] = v));
    item = total;
  }
  if (item + ship <= 0n) return null;
  alloc.forEach((v, i) => (state.remaining[i]! -= v));
  state.shipping -= ship;
  return {
    promotionId: promo.id,
    couponId: promo.couponId,
    name: promo.name,
    kind: promo.kind,
    itemDiscount: item,
    shippingDiscount: ship,
    allocations: lines.flatMap((l, i) => (alloc[i]! > 0n ? [{ variantId: l.variantId, amount: alloc[i]! }] : [])),
  };
}

const sum = (a: AppliedPromotion[]) => a.reduce((s, p) => s + p.itemDiscount + p.shippingDiscount, 0n);

export function evaluatePromotions(input: {
  lines: EngineLine[];
  shipping: bigint;
  candidates: EnginePromotion[];
}): EngineResult {
  const { lines } = input;
  const orderValue = lines.reduce((s, l) => s + gross(l), 0n);
  const order = [...input.candidates].sort((a, b) => a.priority - b.priority || (a.id < b.id ? -1 : 1));
  const fresh = (): State => ({ remaining: lines.map(gross), shipping: input.shipping });

  const stackState = fresh();
  const stacked = order
    .filter((p) => p.stackable)
    .flatMap((p) => {
      const r = applyOne(p, lines, stackState, orderValue);
      return r ? [r] : [];
    });

  let best: AppliedPromotion[] = stacked;
  let bestTotal = sum(stacked);
  for (const p of order.filter((c) => !c.stackable)) {
    const r = applyOne(p, lines, fresh(), orderValue);
    if (r && r.itemDiscount + r.shippingDiscount > bestTotal) {
      best = [r];
      bestTotal = r.itemDiscount + r.shippingDiscount;
    }
  }
  const itemDiscount = best.reduce((s, p) => s + p.itemDiscount, 0n);
  const shippingDiscount = best.reduce((s, p) => s + p.shippingDiscount, 0n);
  return { applied: best, itemDiscount, shippingDiscount, totalDiscount: itemDiscount + shippingDiscount };
}

export function normalizeCouponCode(raw: string): string {
  const latin = raw
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
  // Format characters (ZWNJ, RTL/LTR marks, BOM) are routinely inserted by Persian keyboards and pasted text.
  return latin.normalize('NFKC').toUpperCase().replace(/[\p{Cf}\s\-_]/gu, '');
}

export const COUPON_CODE_PATTERN = /^[A-Z0-9]{4,40}$/;
