import { HttpException, Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { REDIS_CLIENT, type RedisClient } from '../redis/redis.client';

const SCRIPT = `local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('PEXPIRE', KEYS[1], 60000) end
return count`;

@Injectable()
export class DiscoveryRateLimitService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: RedisClient) {}

  async enforce(): Promise<void> {
    // Separate shared capacity budget; no IP/identity retained and no auth counters touched.
    let count: number;
    try {
      count = Number(await this.redis.eval(SCRIPT, 1, `rl:v1:discovery:${Math.floor(Date.now() / 60_000)}`));
      if (!Number.isSafeInteger(count) || count < 1) throw new Error('Invalid limiter reply.');
    } catch { throw new ServiceUnavailableException('Discovery capacity control is unavailable.'); }
    if (count > 600) throw new HttpException('Discovery request limit exceeded.', 429);
  }
}
