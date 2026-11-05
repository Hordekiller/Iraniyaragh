import { describe, expect, it, vi } from 'vitest';
import { PromotionAdminController } from './promotion-admin.controller';
import { PromotionPublicController } from './promotion-public.controller';

const principal = { userId: 'op' } as never;
const svc = () => ({
  list: vi.fn(async () => ({ items: [], total: 0 })), get: vi.fn(async () => ({ id: 'p' })), report: vi.fn(async () => [{ id: 'r' }]),
  redemptions: vi.fn(async () => ({ items: [], total: 0 })), listCoupons: vi.fn(async () => ({ items: [], total: 0 })),
  create: vi.fn(async () => ({ id: 'p' })), update: vi.fn(async () => ({ id: 'p' })), setActive: vi.fn(async () => ({ id: 'p' })),
  generateCoupons: vi.fn(async () => [{ code: 'A' }]), setCouponActive: vi.fn(async () => ({ id: 'c' })), publicCampaigns: vi.fn(async () => [{ id: 'x' }]),
});

describe('promotion controllers delegate with bounded input', () => {
  it('reads', async () => {
    const s = svc(); const c = new PromotionAdminController(s as never);
    expect((await c.list('q'.repeat(200), 'ACTIVE', 'COUPON', '5', '999')).data).toEqual({ items: [], total: 0 });
    expect(s.list).toHaveBeenCalledWith(expect.objectContaining({ q: 'q'.repeat(80), state: 'ACTIVE', mode: 'COUPON' }));
    expect((await c.report()).data).toEqual({ items: [{ id: 'r' }] });
    await c.redemptions('p'.repeat(100), 'c'.repeat(100), 'CONFIRMED', undefined, undefined);
    expect(s.redemptions).toHaveBeenCalledWith(expect.objectContaining({ promotionId: 'p'.repeat(64), customerId: 'c'.repeat(64) }));
    await c.coupons('p1', '0', '10'); await c.get('p1');
    expect(s.listCoupons).toHaveBeenCalled(); expect(s.get).toHaveBeenCalledWith('p1');
  });
  it('mutations pass the actor, request id and a normalized idempotency key', async () => {
    const s = svc(); const c = new PromotionAdminController(s as never); const key = 'promo-key-0001';
    await c.create(principal, key, {} as never); await c.update(principal, 'p', key, { promotion: {} as never, expectedVersion: 2 });
    await c.setActive(principal, 'p', key, { isActive: false, expectedVersion: 2 });
    expect((await c.generate(principal, 'p', key, { code: 'A', maxRedemptions: null, customerId: null })).data.items).toEqual([{ code: 'A' }]);
    await c.setCouponActive(principal, 'c', key, { isActive: true });
    for (const fn of [s.create, s.update, s.setActive, s.generateCoupons, s.setCouponActive]) expect(fn).toHaveBeenCalledOnce();
    expect(s.setActive).toHaveBeenCalledWith('op', expect.any(String), 'p', false, 2, key);
    await expect(c.create(principal, undefined, {} as never)).rejects.toBeDefined();
  });
  it('public feed returns the projection', async () => {
    const s = svc();
    expect((await new PromotionPublicController(s as never).list()).data.items).toEqual([{ id: 'x' }]);
  });
});
