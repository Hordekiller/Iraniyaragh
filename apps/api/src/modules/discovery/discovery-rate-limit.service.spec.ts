import { describe, expect, it, vi } from 'vitest';
import type { RedisClient } from '../redis/redis.client';
import { DiscoveryRateLimitService } from './discovery-rate-limit.service';
describe('discovery capacity budget', () => {
  it('allows the boundary and rejects overflow using a separate identity-free atomic budget', async () => {
    const evalScript = vi.fn().mockResolvedValueOnce(600).mockResolvedValueOnce(601);
    const limiter = new DiscoveryRateLimitService({ eval: evalScript } as unknown as RedisClient);
    await expect(limiter.enforce()).resolves.toBeUndefined(); await expect(limiter.enforce()).rejects.toMatchObject({ status: 429 });
    expect(evalScript.mock.calls[0]).toEqual([expect.stringContaining("redis.call('PEXPIRE'"), 1, expect.stringMatching(/^rl:v1:discovery:\d+$/u)]);
  });
  it('fails closed on Redis failure or an invalid reply', async () => {
    for (const result of [undefined, null, 0, -1, NaN, 1.5]) await expect(new DiscoveryRateLimitService({ eval: vi.fn().mockResolvedValue(result) } as unknown as RedisClient).enforce()).rejects.toMatchObject({ status: 503 });
    await expect(new DiscoveryRateLimitService({ eval: vi.fn().mockRejectedValue(new Error('disconnected')) } as unknown as RedisClient).enforce()).rejects.toMatchObject({ status: 503 });
  });
});
