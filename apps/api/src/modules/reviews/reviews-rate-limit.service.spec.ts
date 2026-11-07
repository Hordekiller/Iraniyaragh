import { describe, expect, it } from 'vitest';
import { ReviewsRateLimitService, REVIEW_WRITE_LIMIT } from './reviews-rate-limit.service';

const redis = (impl: () => Promise<unknown>) => ({ eval: impl }) as never;

describe('ReviewsRateLimitService', () => {
  it('allows writes up to the limit and rejects the next with 429', async () => {
    let n = 0;
    const service = new ReviewsRateLimitService(redis(async () => [++n, 1_800_000]));
    for (let i = 0; i < REVIEW_WRITE_LIMIT; i++) await expect(service.enforceWrite('u1')).resolves.toBeUndefined();
    await expect(service.enforceWrite('u1')).rejects.toMatchObject({ status: 429 });
  });
  it('fails closed when Redis is unavailable or answers garbage', async () => {
    await expect(new ReviewsRateLimitService(redis(async () => { throw new Error('down'); })).enforceWrite('u')).rejects.toMatchObject({ status: 503 });
    await expect(new ReviewsRateLimitService(redis(async () => [0, 0])).enforceWrite('u')).rejects.toMatchObject({ status: 503 });
  });
  it('keys by user and hourly window only', async () => {
    const keys: string[] = [];
    const service = new ReviewsRateLimitService({ eval: async (_s: string, _n: number, key: string) => { keys.push(key); return [1, 1000]; } } as never);
    await service.enforceWrite('user-9');
    expect(keys[0]).toMatch(/^rl:v1:review-write:user-9:\d+$/u);
  });
});
