import { BadRequestException } from '@nestjs/common';
import type { PromotionInput, PromotionState } from '@iranyaragh/contracts';

const MONEY = /^(0|[1-9][0-9]{0,17})$/u;
const MAX_INT = 2_147_483_647;
const invalid = (message: string) => new BadRequestException({ code: 'INVALID_REQUEST', message });

export type ValidPromotion = {
  name: string;
  description: string | null;
  badgeText: string | null;
  kind: PromotionInput['kind'];
  mode: PromotionInput['mode'];
  percentBp: number | null;
  amount: bigint | null;
  maxDiscount: bigint | null;
  minOrder: bigint | null;
  maxOrder: bigint | null;
  startsAt: Date | null;
  endsAt: Date | null;
  maxRedemptions: number | null;
  perCustomerLimit: number | null;
  firstPurchaseOnly: boolean;
  customerId: string | null;
  stackable: boolean;
  priority: number;
  targets: { type: PromotionInput['targets'][number]['type']; targetId: string; exclude: boolean }[];
};

const text = (value: unknown, max: number, required: boolean, label: string): string | null => {
  if (value === null || value === undefined || value === '') {
    if (required) throw invalid(`${label} is required.`);
    return null;
  }
  if (typeof value !== 'string') throw invalid(`${label} must be text.`);
  const v = value.normalize('NFKC').trim();
  if (!v && required) throw invalid(`${label} is required.`);
  if (v.length > max || /\p{Cc}/u.test(v)) throw invalid(`${label} is invalid.`);
  return v || null;
};
const money = (value: unknown, label: string, positive = true): bigint | null => {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' || !MONEY.test(value)) throw invalid(`${label} must be an integer IRR amount.`);
  const n = BigInt(value);
  if (positive && n <= 0n) throw invalid(`${label} must be positive.`);
  return n;
};
const int = (value: unknown, label: string, min: number, max = MAX_INT): number | null => {
  if (value === null || value === undefined) return null;
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) {
    throw invalid(`${label} is out of range.`);
  }
  return value as number;
};
const date = (value: unknown, label: string): Date | null => {
  if (value === null || value === undefined) return null;
  const d = typeof value === 'string' ? new Date(value) : new Date(NaN);
  if (Number.isNaN(d.getTime())) throw invalid(`${label} must be an ISO date.`);
  return d;
};

export function validatePromotionInput(input: PromotionInput): ValidPromotion {
  if (typeof input !== 'object' || input === null) throw invalid('Body is required.');
  const kind = input.kind;
  if (!['PERCENTAGE', 'FIXED_CART', 'FIXED_ITEM', 'FREE_SHIPPING'].includes(kind)) throw invalid('Unknown kind.');
  if (!['COUPON', 'AUTOMATIC'].includes(input.mode)) throw invalid('Unknown mode.');
  const percentBp = int(input.percentBp, 'percentBp', 1, 10000);
  const amount = money(input.amount, 'amount');
  if (kind === 'PERCENTAGE' && percentBp === null) throw invalid('percentBp is required for percentage promotions.');
  if ((kind === 'FIXED_CART' || kind === 'FIXED_ITEM') && amount === null) throw invalid('amount is required for fixed promotions.');
  const startsAt = date(input.startsAt, 'startsAt');
  const endsAt = date(input.endsAt, 'endsAt');
  if (startsAt && endsAt && startsAt >= endsAt) throw invalid('endsAt must be after startsAt.');
  const minOrder = money(input.minOrder, 'minOrder', false);
  const maxOrder = money(input.maxOrder, 'maxOrder');
  if (minOrder !== null && maxOrder !== null && minOrder > maxOrder) throw invalid('minOrder exceeds maxOrder.');
  if (!Array.isArray(input.targets) || input.targets.length > 200) throw invalid('At most 200 targets are allowed.');
  const seen = new Set<string>();
  const targets = input.targets.map((t) => {
    if (!['PRODUCT', 'VARIANT', 'CATEGORY', 'BRAND'].includes(t?.type) || typeof t.targetId !== 'string' || !t.targetId || t.targetId.length > 64 || typeof t.exclude !== 'boolean') {
      throw invalid('Invalid target.');
    }
    const key = `${t.type}:${t.targetId}:${t.exclude}`;
    if (seen.has(key)) throw invalid('Duplicate target.');
    seen.add(key);
    return { type: t.type, targetId: t.targetId, exclude: t.exclude };
  });
  if (typeof input.firstPurchaseOnly !== 'boolean' || typeof input.stackable !== 'boolean') throw invalid('Boolean flags are required.');
  if (input.customerId !== null && (typeof input.customerId !== 'string' || input.customerId.length > 64)) throw invalid('Invalid customer.');
  return {
    name: text(input.name, 160, true, 'name')!,
    description: text(input.description, 500, false, 'description'),
    badgeText: text(input.badgeText, 40, false, 'badgeText'),
    kind,
    mode: input.mode,
    percentBp: kind === 'PERCENTAGE' ? percentBp : null,
    amount: kind === 'FIXED_CART' || kind === 'FIXED_ITEM' ? amount : null,
    maxDiscount: money(input.maxDiscount, 'maxDiscount'),
    minOrder,
    maxOrder,
    startsAt,
    endsAt,
    maxRedemptions: int(input.maxRedemptions, 'maxRedemptions', 1),
    perCustomerLimit: int(input.perCustomerLimit, 'perCustomerLimit', 1),
    firstPurchaseOnly: input.firstPurchaseOnly,
    customerId: input.customerId,
    stackable: input.stackable,
    priority: int(input.priority, 'priority', 0, 10000) ?? 100,
    targets,
  };
}

export function promotionState(
  p: { isActive: boolean; startsAt: Date | null; endsAt: Date | null; maxRedemptions: number | null; usedCount: number },
  now: Date,
): PromotionState {
  if (!p.isActive) return 'INACTIVE';
  if (p.endsAt && p.endsAt <= now) return 'EXPIRED';
  if (p.startsAt && p.startsAt > now) return 'SCHEDULED';
  if (p.maxRedemptions !== null && p.usedCount >= p.maxRedemptions) return 'EXHAUSTED';
  return 'ACTIVE';
}
