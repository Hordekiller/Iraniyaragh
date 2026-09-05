import Redis from 'ioredis';
import { RedactedLogger } from '../../common/redacted-logger';
import { safeErrorMessage } from '../../common/redaction';
import type { RedisClient } from './redis.client';

function toRedisClient(connection: Redis): RedisClient {
  return connection as unknown as RedisClient;
}

/**
 * Builds the Auth runtime's Redis client. Connection is lazy so the API boots
 * even when Redis is temporarily unknown; per-request availability is enforced
 * by the RateLimitService (fail-closed 503 on auth). An error listener prevents
 * an unhandled 'error' event from crashing the process, and the limiter decides
 * the observable behavior.
 */
export function provideRedisClient(redisUrl: string, options: { keyPrefix?: string } = {}): RedisClient {
  const connection = new Redis(redisUrl, {
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    retryStrategy: attempts => (attempts > 5 ? null : Math.min(200 * attempts, 2_000)),
    ...(options.keyPrefix ? { keyPrefix: options.keyPrefix } : {}),
  });

  connection.on('error', (error: unknown) => {
    new RedactedLogger().error('Redis connection error.', { message: safeErrorMessage(error) });
  });

  return toRedisClient(connection);
}