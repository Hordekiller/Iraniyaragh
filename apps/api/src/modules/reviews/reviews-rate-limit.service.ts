import { HttpException, Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { REDIS_CLIENT, type RedisClient } from '../redis/redis.client';

const SCRIPT = `local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
return {count, redis.call('PTTL', KEYS[1])}`;

export const REVIEW_WRITE_LIMIT = 10;
export const REVIEW_WRITE_WINDOW_SECONDS = 3600;

/**
 * Per-customer budget for review writes (create + edit). Fixed window in Redis, keyed by the opaque
 * user id only; fails closed so a limiter outage cannot become a spam channel.
 */
@Injectable()
export class ReviewsRateLimitService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: RedisClient) {}

  async enforceWrite(userId: string): Promise<void> {
    const windowMs = REVIEW_WRITE_WINDOW_SECONDS * 1000;
    let count: number;
    let ttlMs: number;
    try {
      const reply = (await this.redis.eval(SCRIPT, 1, `rl:v1:review-write:${userId}:${Math.floor(Date.now() / windowMs)}`, String(windowMs))) as [number, number];
      count = Number(reply[0]); ttlMs = Number(reply[1]);
      if (!Number.isSafeInteger(count) || count < 1) throw new Error('Invalid limiter reply.');
    } catch { throw new ServiceUnavailableException({ code: 'UPSTREAM_UNAVAILABLE', message: 'Review rate control is unavailable.' }); }
    if (count > REVIEW_WRITE_LIMIT) {
      throw new HttpException({ code: 'RATE_LIMITED', message: 'Too many review submissions. Please retry later.', statusCode: 429, retryAfterSeconds: Math.max(1, Math.ceil(ttlMs / 1000)) }, 429);
    }
  }
}
