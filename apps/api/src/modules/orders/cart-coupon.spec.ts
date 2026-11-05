import { describe, expect, it, vi } from 'vitest';
import { CartCouponController } from './cart-coupon.controller';
import { CartCouponService } from './cart-coupon.service';

const principal = { userId: 'u1' } as never;

describe('cart coupon controller', () => {
  it('validates the body and delegates with the authenticated user', async () => {
    const coupons = { apply: vi.fn(async () => ({ data: {} })), remove: vi.fn(async () => ({ data: {} })) };
    const c = new CartCouponController(coupons as never);
    expect(() => c.apply(principal, undefined as never)).toThrowError();
    expect(() => c.apply(principal, { code: 5 } as never)).toThrowError();
    expect(() => c.apply(principal, { code: 'x'.repeat(65) })).toThrowError();
    await c.apply(principal, { code: 'SAVE10' });
    expect(coupons.apply).toHaveBeenCalledWith('u1', 'SAVE10', expect.any(String));
    await c.remove(principal);
    expect(coupons.remove).toHaveBeenCalledWith('u1', expect.any(String));
  });
});

describe('cart coupon service guards', () => {
  const make = (customer: unknown) => {
    const prisma = { customer: { findUnique: vi.fn(async () => customer) }, $transaction: vi.fn() };
    const limiter = { enforce: vi.fn(async () => undefined) };
    return { prisma, limiter, service: new CartCouponService(prisma as never, { getForUser: vi.fn() } as never, limiter as never, { record: vi.fn() } as never) };
  };
  it('requires a customer profile', async () => {
    await expect(make(null).service.apply('u', 'SAVE10', 'r')).rejects.toMatchObject({ response: { code: 'CUSTOMER_ACCOUNT_REQUIRED' } });
    await expect(make(null).service.remove('u', 'r')).rejects.toMatchObject({ response: { code: 'CUSTOMER_ACCOUNT_REQUIRED' } });
  });
  it('throttles before inspecting the code and rejects malformed codes without touching the cart', async () => {
    const { service, prisma, limiter } = make({ id: 'c1' });
    await expect(service.apply('u', '!!', 'r')).rejects.toMatchObject({ response: { code: 'COUPON_NOT_FOUND' } });
    expect(limiter.enforce).toHaveBeenCalledWith('c1');
    expect(prisma.$transaction).not.toHaveBeenCalled();
    limiter.enforce.mockRejectedValueOnce(Object.assign(new Error('limited'), { status: 429 }));
    await expect(service.apply('u', 'SAVE10', 'r')).rejects.toMatchObject({ status: 429 });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
