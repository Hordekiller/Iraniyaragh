import { describe, expect, it } from 'vitest';
import { evaluatePromotions, normalizeCouponCode, type EngineLine, type EnginePromotion } from './promotion-engine';

const line = (variantId: string, unit: number, qty: number, o: Partial<EngineLine> = {}): EngineLine => ({
  variantId, productId: `p-${variantId}`, categoryIds: ['c1', 'root'], brandId: 'b1', unitPrice: BigInt(unit), quantity: qty, ...o,
});
const promo = (o: Partial<EnginePromotion>): EnginePromotion => ({
  id: 'a', couponId: null, name: 'n', kind: 'PERCENTAGE', percentBp: 1000, amount: null, maxDiscount: null,
  minOrder: null, maxOrder: null, stackable: false, priority: 100, targets: [], ...o,
});
const lines = [line('v1', 1000, 2), line('v2', 500, 1)]; // 2500

describe('promotion engine', () => {
  it('percentage rounds half-up once and is capped', () => {
    expect(evaluatePromotions({ lines, shipping: 0n, candidates: [promo({ percentBp: 1001 })] }).totalDiscount).toBe(250n); // 250.25
    expect(evaluatePromotions({ lines: [line('v1', 5, 1)], shipping: 0n, candidates: [promo({ percentBp: 1000 })] }).totalDiscount).toBe(1n); // .5 -> 1
    expect(evaluatePromotions({ lines, shipping: 0n, candidates: [promo({ maxDiscount: 100n })] }).totalDiscount).toBe(100n);
  });
  it('fixed cart never exceeds eligible total and allocations sum exactly', () => {
    const r = evaluatePromotions({ lines, shipping: 0n, candidates: [promo({ kind: 'FIXED_CART', amount: 9999n })] });
    expect(r.totalDiscount).toBe(2500n);
    expect(r.applied[0]!.allocations.reduce((s, a) => s + a.amount, 0n)).toBe(2500n);
    const odd = evaluatePromotions({ lines: [line('a', 1, 1), line('b', 1, 1), line('c', 1, 1)], shipping: 0n, candidates: [promo({ kind: 'FIXED_CART', amount: 2n })] });
    expect(odd.applied[0]!.allocations.reduce((s, a) => s + a.amount, 0n)).toBe(2n);
  });
  it('fixed item applies per unit on eligible SKU only', () => {
    const r = evaluatePromotions({ lines, shipping: 0n, candidates: [promo({ kind: 'FIXED_ITEM', amount: 100n, targets: [{ type: 'VARIANT', targetId: 'v1', exclude: false }] })] });
    expect(r.totalDiscount).toBe(200n);
  });
  it('category/brand/product targets and excludes', () => {
    const l = [line('v1', 1000, 1, { categoryIds: ['c1'] }), line('v2', 1000, 1, { categoryIds: ['c2'], brandId: 'b2' })];
    const t = (type: any, targetId: string, exclude = false) => promo({ targets: [{ type, targetId, exclude }] });
    expect(evaluatePromotions({ lines: l, shipping: 0n, candidates: [t('CATEGORY', 'c1')] }).totalDiscount).toBe(100n);
    expect(evaluatePromotions({ lines: l, shipping: 0n, candidates: [t('BRAND', 'b2')] }).totalDiscount).toBe(100n);
    expect(evaluatePromotions({ lines: l, shipping: 0n, candidates: [t('PRODUCT', 'p-v2', true)] }).totalDiscount).toBe(100n);
    expect(evaluatePromotions({ lines: l, shipping: 0n, candidates: [t('CATEGORY', 'zzz')] }).totalDiscount).toBe(0n);
  });
  it('min and max order bounds', () => {
    expect(evaluatePromotions({ lines, shipping: 0n, candidates: [promo({ minOrder: 2501n })] }).totalDiscount).toBe(0n);
    expect(evaluatePromotions({ lines, shipping: 0n, candidates: [promo({ minOrder: 2500n })] }).totalDiscount).toBe(250n);
    expect(evaluatePromotions({ lines, shipping: 0n, candidates: [promo({ maxOrder: 2499n })] }).totalDiscount).toBe(0n);
  });
  it('free shipping discounts only shipping', () => {
    const r = evaluatePromotions({ lines, shipping: 700n, candidates: [promo({ kind: 'FREE_SHIPPING', percentBp: null })] });
    expect(r.shippingDiscount).toBe(700n);
    expect(r.itemDiscount).toBe(0n);
  });
  it('stackable promos compound on remaining; exclusive competes by best total', () => {
    const a = promo({ id: 'a', stackable: true, percentBp: 1000 });
    const b = promo({ id: 'b', stackable: true, kind: 'FIXED_CART', amount: 100n, priority: 200 });
    const r = evaluatePromotions({ lines, shipping: 0n, candidates: [b, a] });
    expect(r.totalDiscount).toBe(350n);
    const big = promo({ id: 'c', percentBp: 5000 });
    expect(evaluatePromotions({ lines, shipping: 0n, candidates: [a, b, big] }).applied.map((p) => p.promotionId)).toEqual(['c']);
    const small = promo({ id: 'd', percentBp: 100 });
    expect(evaluatePromotions({ lines, shipping: 0n, candidates: [a, b, small] }).applied.map((p) => p.promotionId)).toEqual(['a', 'b']);
  });
  it('never exceeds payable and is deterministic', () => {
    const c = [promo({ id: 'x', stackable: true, kind: 'FIXED_CART', amount: 2000n }), promo({ id: 'y', stackable: true, kind: 'FIXED_CART', amount: 2000n, priority: 101 })];
    const r1 = evaluatePromotions({ lines, shipping: 0n, candidates: c });
    expect(r1.totalDiscount).toBe(2500n);
    expect(evaluatePromotions({ lines, shipping: 0n, candidates: [...c].reverse() })).toEqual(r1);
  });
  it('normalizes coupon codes', () => {
    expect(normalizeCouponCode(' ab-۱۲ cd_٣ ')).toBe('AB12CD3');
  });
});
