import { Inject, Injectable, ServiceUnavailableException, HttpException, HttpStatus } from '@nestjs/common';
import { REDIS_CLIENT, type RedisClient } from '../redis/redis.client';
import { AuthHashService, type AuthHashContext } from './auth-hash.service';
import {
  RATE_LIMITER_UNAVAILABLE,
  RATE_LIMIT_KEY_VERSION,
  RATE_LIMIT_DEFINITIONS,
  type RateLimitDefinition,
} from './rate-limit.config';

const INCREMENT_WINDOW_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
local ttl
if count == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
else
  ttl = redis.call('PTTL', KEYS[1])
end
return {count, ttl}
`;

export class RateLimitException extends HttpException {
  constructor(readonly retryAfterSeconds: number) {
    super(
      {
        code: 'RATE_LIMITED',
        message: 'Too many requests. Please retry later.',
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

export type RateLimitDecision = Readonly<{
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
  windowSeconds: number;
}>;

export type RateLimitDimension = keyof typeof RATE_LIMIT_DEFINITIONS;

@Injectable()
export class RateLimitService {
  constructor(
    @Inject(REDIS_CLIENT) private readonly client: RedisClient,
    private readonly hashes: AuthHashService,
  ) {}

  /**
   * Fixed-window test-and-increment over Redis. `value` is a canonical non-secret
   * seed (an identifier or IP) that is keyed-hashed here in the given context
   * ("identifier" or "ip"). Throws RATE_LIMITED (429) when the limit is exceeded
   * or UPSTREAM_UNAVAILABLE (503) when Redis is unavailable (fail-closed). The
   * response never reveals which dimension fired.
   */
  async enforce(opts: {
    dimension: RateLimitDimension;
    value: string;
    context: Extract<AuthHashContext, 'identifier' | 'ip'>;
    windowSeconds?: number;
    limit?: number;
  }): Promise<RateLimitDecision> {
    const definition = this.definitionFor(opts.dimension);
    const windowSeconds = opts.windowSeconds ?? definition.windowSeconds;
    const limit = opts.limit ?? definition.limit;

    const decision = await this.check(opts.dimension, opts.value, opts.context, windowSeconds, limit);
    if (decision.allowed) return decision;
    throw new RateLimitException(decision.retryAfterSeconds);
  }

  private async check(
    dimensionKey: RateLimitDimension,
    value: string,
    context: Extract<AuthHashContext, 'identifier' | 'ip'>,
    windowSeconds: number,
    limit: number,
  ): Promise<RateLimitDecision> {
    const nowSeconds = Math.floor(Date.now() / 1_000);
    const windowIndex = Math.floor(nowSeconds / windowSeconds);
    const dimension = this.safeDimension(dimensionKey);
    const valueHash = this.hashes.hash(value, context);

    const key = this.buildKey(dimensionKey, dimension, valueHash, windowIndex);

    let count: number;
    let ttlMs: number;
    try {
      const reply = (await this.client.eval(
        INCREMENT_WINDOW_SCRIPT,
        1,
        key,
        String(windowSeconds * 1_000),
      )) as [number, number];
      count = Number(reply[0]);
      ttlMs = Number(reply[1]);
    } catch (error) {
      this.rethrowAsUpstream(error);
    }

    const allowed = count <= limit;
    return Object.freeze({
      allowed,
      limit,
      remaining: allowed ? Math.max(0, limit - count) : 0,
      retryAfterSeconds: Math.min(windowSeconds, Math.max(1, Math.ceil(ttlMs / 1_000))),
      windowSeconds,
    });
  }

  /**
   * Deletes the current-window counter for the dimension/value, used to clear
   * applicable failure counters after a successful full authentication. Old
   * windows are left to expire naturally.
   */
  async reset(opts: {
    dimension: RateLimitDimension;
    value: string;
    context: Extract<AuthHashContext, 'identifier' | 'ip'>;
    windowSeconds?: number;
  }): Promise<void> {
    const definition = this.definitionFor(opts.dimension);
    const windowSeconds = opts.windowSeconds ?? definition.windowSeconds;
    const nowSeconds = Math.floor(Date.now() / 1_000);
    const windowIndex = Math.floor(nowSeconds / windowSeconds);
    const dimension = this.safeDimension(opts.dimension);
    const valueHash = this.hashes.hash(opts.value, opts.context);
    const key = this.buildKey(opts.dimension, dimension, valueHash, windowIndex);

    try {
      await this.client.del(key);
    } catch (error) {
      this.rethrowAsUpstream(error);
    }
  }

  private buildKey(dimension: RateLimitDimension, safeDimension: string, valueHash: string, windowIndex: number): string {
    return `rl:v${RATE_LIMIT_KEY_VERSION}:auth:${safeDimension}:${valueHash}:${windowIndex}`;
  }

  private safeDimension(dimension: RateLimitDimension): string {
    if (!/^[a-z0-9:-]{1,64}$/u.test(dimension)) {
      throw new TypeError('Rate-limit dimension is invalid.');
    }
    return dimension;
  }

  private definitionFor(dimension: RateLimitDimension): RateLimitDefinition {
    const definition = RATE_LIMIT_DEFINITIONS[dimension];
    if (!definition) throw new TypeError(`Unknown rate-limit dimension: ${dimension}`);
    return definition;
  }

  private rethrowAsUpstream(error: unknown): never {
    throw new ServiceUnavailableException({
      code: RATE_LIMITER_UNAVAILABLE,
      message: 'The security dependency is temporarily unavailable. Please retry shortly.',
      statusCode: HttpStatus.SERVICE_UNAVAILABLE,
      cause: error,
    });
  }
}

export { RATE_LIMITER_UNAVAILABLE };
