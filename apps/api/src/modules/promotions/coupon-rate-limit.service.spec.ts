import { describe, expect, it, vi } from 'vitest';
import { CouponRateLimitService } from './coupon-rate-limit.service';

const service = (eval_: (...args: unknown[]) => Promise<unknown>) => new CouponRateLimitService({ eval: vi.fn(eval_) } as never);

describe('coupon guessing throttle', () => {
  it('allows 15 attempts per window and rejects the 16th with a 429', async () => {
    let count = 0;
    const limiter = service(async () => ++count);
    for (let i = 0; i < 15; i += 1) await expect(limiter.enforce('c1')).resolves.toBeUndefined();
    await expect(limiter.enforce('c1')).rejects.toMatchObject({ status: 429, response: { code: 'RATE_LIMITED' } });
  });
  it('is keyed per customer with a bounded expiry window', async () => {
    const redis = { eval: vi.fn(async () => 1) };
    await new CouponRateLimitService(redis as never).enforce('customer-7');
    expect(redis.eval).toHaveBeenCalledWith(expect.stringContaining('EXPIRE'), 1, 'rl:v1:coupon:customer-7', '600');
  });
  it('fails closed (503) when Redis errors or returns a malformed reply', async () => {
    for (const reply of [() => Promise.reject(new Error('down')), async () => 'garbage', async () => 0, async () => -1]) {
      await expect(service(reply).enforce('c1')).rejects.toMatchObject({ status: 503, response: { code: 'RATE_LIMIT_UNAVAILABLE' } });
    }
  });
});
