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
 *
 * The offline queue stays enabled on purpose. With `lazyConnect` the first
 * command arrives before the connect handshake completes, and disabling the
 * queue makes ioredis reject that command with "Stream isn't writeable and
 * enableOfflineQueue options is false" instead of waiting a few milliseconds.
 * That is a cold-connect race, not unavailability, so it produced a spurious
 * 503 on the first auth request after every boot. A genuinely unreachable Redis
 * still fails closed: `maxRetriesPerRequest` rejects the queued command after a
 * single retry, which the RateLimitService maps to UPSTREAM_UNAVAILABLE (503).
 */
export function provideRedisClient(redisUrl: string, options: { keyPrefix?: string } = {}): RedisClient {
  const connection = new Redis(redisUrl, {
    lazyConnect: true,
    enableOfflineQueue: true,
    maxRetriesPerRequest: 1,
    retryStrategy: attempts => (attempts > 5 ? null : Math.min(200 * attempts, 2_000)),
    ...(options.keyPrefix ? { keyPrefix: options.keyPrefix } : {}),
  });

  connection.on('error', (error: unknown) => {
    new RedactedLogger().error('Redis connection error.', { message: safeErrorMessage(error) });
  });

  return toRedisClient(connection);
}