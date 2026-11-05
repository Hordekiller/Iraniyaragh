import { HttpException, Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { REDIS_CLIENT, type RedisClient } from '../redis/redis.client';

const WINDOW_SECONDS = 600;
const LIMIT = 15;
const SCRIPT = `local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return count`;

/** Throttles coupon-code guessing per customer; fails closed when Redis is unavailable. */
@Injectable()
export class CouponRateLimitService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: RedisClient) {}

  async enforce(customerId: string): Promise<void> {
    let count: number;
    try {
      count = Number(await this.redis.eval(SCRIPT, 1, `rl:v1:coupon:${customerId}`, String(WINDOW_SECONDS)));
      if (!Number.isSafeInteger(count) || count < 1) throw new Error('Invalid limiter reply.');
    } catch {
      throw new ServiceUnavailableException({ code: 'RATE_LIMIT_UNAVAILABLE', message: 'Coupon validation is temporarily unavailable.' });
    }
    if (count > LIMIT) {
      throw new HttpException({ code: 'RATE_LIMITED', message: 'تعداد تلاش‌ها برای ثبت کد تخفیف زیاد است؛ کمی بعد دوباره تلاش کنید.' }, 429);
    }
  }
}
