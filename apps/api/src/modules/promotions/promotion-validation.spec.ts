import { describe, expect, it } from 'vitest';
import type { PromotionInput } from '@iranyaragh/contracts';
import { promotionState, validatePromotionInput } from './promotion-validation';
import { CouponRejection, conflictFromRejection, couponMessage } from './promotions.service';

const base = (o: Partial<PromotionInput> = {}): PromotionInput => ({
  name: ' کمپین ', description: null, badgeText: null, kind: 'PERCENTAGE', mode: 'COUPON', percentBp: 1000, amount: null,
  maxDiscount: null, minOrder: null, maxOrder: null, startsAt: null, endsAt: null, maxRedemptions: null, perCustomerLimit: null,
  firstPurchaseOnly: false, customerId: null, stackable: false, priority: 100, targets: [], ...o,
});
const reject = (o: Partial<PromotionInput>) => expect(() => validatePromotionInput(base(o))).toThrowError();

describe('promotion input validation', () => {
  it('normalizes a valid input', () => {
    const v = validatePromotionInput(base({ maxDiscount: '5000', minOrder: '100', targets: [{ type: 'BRAND', targetId: 'b', exclude: false }] }));
    expect(v).toMatchObject({ name: 'کمپین', percentBp: 1000, amount: null, maxDiscount: 5000n, minOrder: 100n, priority: 100 });
  });
  it('drops fields that do not belong to the kind', () => {
    expect(validatePromotionInput(base({ kind: 'FIXED_CART', percentBp: 500, amount: '2000' }))).toMatchObject({ percentBp: null, amount: 2000n });
    expect(validatePromotionInput(base({ kind: 'FREE_SHIPPING', percentBp: 500, amount: '2000' }))).toMatchObject({ percentBp: null, amount: null });
  });
  it('rejects malformed bodies, kinds, modes and required values', () => {
    expect(() => validatePromotionInput(null as never)).toThrowError();
    reject({ kind: 'X' as never });
    reject({ mode: 'X' as never });
    reject({ percentBp: null });
    reject({ percentBp: 10001 });
    reject({ percentBp: 1.5 });
    reject({ kind: 'FIXED_ITEM', amount: null });
    reject({ kind: 'FIXED_CART', amount: '-5' });
    reject({ kind: 'FIXED_CART', amount: '1.5' });
    reject({ name: '   ' });
    reject({ name: 'x'.repeat(161) });
    reject({ badgeText: 'x'.repeat(41) });
  });
  it('validates dates, bounds, flags, customer and targets', () => {
    reject({ startsAt: 'not-a-date' });
    reject({ startsAt: 5 as never });
    reject({ startsAt: '2030-01-02T00:00:00Z', endsAt: '2030-01-01T00:00:00Z' });
    reject({ minOrder: '500', maxOrder: '100' });
    reject({ maxRedemptions: 0 });
    reject({ perCustomerLimit: -1 });
    reject({ priority: 10001 });
    reject({ firstPurchaseOnly: 'yes' as never });
    reject({ stackable: undefined as never });
    reject({ customerId: 'c'.repeat(65) });
    reject({ targets: 'x' as never });
    reject({ targets: Array.from({ length: 201 }, (_, i) => ({ type: 'PRODUCT' as const, targetId: `p${i}`, exclude: false })) });
    reject({ targets: [{ type: 'NOPE' as never, targetId: 'a', exclude: false }] });
    reject({ targets: [{ type: 'PRODUCT', targetId: '', exclude: false }] });
    reject({ targets: [{ type: 'PRODUCT', targetId: 'a', exclude: 'no' as never }] });
    reject({ targets: [{ type: 'PRODUCT', targetId: 'a', exclude: false }, { type: 'PRODUCT', targetId: 'a', exclude: false }] });
    expect(validatePromotionInput(base({ startsAt: '2030-01-01T00:00:00Z', endsAt: '2030-02-01T00:00:00Z', customerId: 'cust' }))).toMatchObject({ customerId: 'cust' });
  });
});

describe('promotion state and coupon messages', () => {
  const now = new Date('2030-01-10T00:00:00Z');
  const row = (o = {}) => ({ isActive: true, startsAt: null, endsAt: null, maxRedemptions: null, usedCount: 0, ...o });
  it('derives the state from server time only', () => {
    expect(promotionState(row({ isActive: false }), now)).toBe('INACTIVE');
    expect(promotionState(row({ endsAt: new Date('2030-01-10T00:00:00Z') }), now)).toBe('EXPIRED');
    expect(promotionState(row({ startsAt: new Date('2030-01-11T00:00:00Z') }), now)).toBe('SCHEDULED');
    expect(promotionState(row({ maxRedemptions: 2, usedCount: 2 }), now)).toBe('EXHAUSTED');
    expect(promotionState(row({ maxRedemptions: 2, usedCount: 1 }), now)).toBe('ACTIVE');
  });
  it('maps a rejection to a Persian 409 conflict', () => {
    const rejection = new CouponRejection('COUPON_EXPIRED');
    const conflict = conflictFromRejection(rejection);
    expect(conflict.getStatus()).toBe(409);
    expect(conflict.getResponse()).toMatchObject({ code: 'COUPON_EXPIRED', message: couponMessage('COUPON_EXPIRED') });
    expect(couponMessage('COUPON_EXPIRED')).toMatch(/[؀-ۿ]/);
  });
});
