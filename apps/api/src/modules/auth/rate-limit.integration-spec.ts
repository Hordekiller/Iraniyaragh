import { ServiceUnavailableException } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RedisClient } from '../redis/redis.client';
import { provideRedisClient } from '../redis/redis.provider';
import { type AuthRuntimeConfig } from './auth.config';
import { AuthHashService } from './auth-hash.service';
import { RateLimitException, RateLimitService } from './rate-limit.service';

const runtimeConfig: AuthRuntimeConfig = Object.freeze({
  accessSigningSecret: 'integration-access-secret-32-bytes-minimum-value',
  issuer: 'iranyaragh-rate-limit-integration',
  audience: 'iranyaragh-browser',
  accessTokenTtlSeconds: 600,
  clockToleranceSeconds: 30,
  currentHashKey: Object.freeze({
    version: 2,
    secret: 'integration-current-hash-secret-32-bytes-minimum',
  }),
  previousHashKey: Object.freeze({
    version: 1,
    secret: 'integration-previous-hash-secret-32-bytes-minimum',
  }),
  devLoginEnabled: false,
  devCode: '',
  cookies: Object.freeze({
    refreshName: '__Host-iranyaragh_refresh',
    csrfName: '__Host-iranyaragh_csrf',
    secure: true,
    sameSite: 'strict',
    path: '/',
  }),
});

interface RedisProbe extends RedisClient {
  readonly connect: () => Promise<'OK'>;
  readonly ping: () => Promise<string>;
  readonly keys: (pattern: string) => Promise<string[]>;
  readonly disconnect: () => void;
}

const REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
const PROBE_TIMEOUT_MS = 2_000;

async function connectRedis(): Promise<RedisProbe | null> {
  const client = provideRedisClient(REDIS_URL) as RedisProbe;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const ready = await Promise.race([
      client
        .connect()
        .then(() => client.ping())
        .then(() => true),
      new Promise<boolean>(resolve => {
        timer = setTimeout(() => resolve(false), PROBE_TIMEOUT_MS);
      }),
    ]);
    if (!ready) {
      client.disconnect();
      return null;
    }
    return client;
  } catch {
    try {
      client.disconnect();
    } catch {
      // best-effort teardown of an unconnected lazy client
    }
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

describe('RateLimitService live Redis integration', () => {
  let client: RedisProbe | null = null;
  let hashes: AuthHashService;
  let service: RateLimitService;
  let available = false;

  beforeAll(async () => {
    client = await connectRedis();
    hashes = new AuthHashService(runtimeConfig);
    service = new RateLimitService(client as unknown as RedisClient, hashes);
    available = client !== null;
  });

  afterAll(async () => {
    if (client && client.status === 'ready') {
      await client.quit();
    }
  });

  const mobileFor = (seed: string): string => `+9891${Date.now()}${seed}`;

  it('skips quietly when no live Redis is reachable', async context => {
    if (available) return;
    context.skip();
  });

  it('enforces a fixed window against real Redis, then refuses beyond the limit', async context => {
    if (!available) return context.skip();
    const mobile = mobileFor('cross');
    const dimension = 'otp-request:destination';

    const first = await service.enforce({ dimension, value: mobile, context: 'identifier', limit: 2 });
    expect(first.allowed).toBe(true);
    expect(first.remaining).toBe(1);

    const second = await service.enforce({ dimension, value: mobile, context: 'identifier', limit: 2 });
    expect(second.allowed).toBe(true);
    expect(second.remaining).toBe(0);

    let thrown = false;
    try {
      await service.enforce({ dimension, value: mobile, context: 'identifier', limit: 2 });
    } catch (error) {
      thrown = true;
      expect(error).toBeInstanceOf(RateLimitException);
      const e = error as RateLimitException;
      expect(e.getStatus()).toBe(429);
      expect(e.retryAfterSeconds).toBeGreaterThan(0);
      expect(e.retryAfterSeconds).toBeLessThanOrEqual(60);
    }
    expect(thrown).toBe(true);
  });

  it('persists only the keyed hash, never the raw identifier', async context => {
    if (!available) return context.skip();
    const mobile = mobileFor('hash');
    const dimension = 'otp-request:destination-15m';
    await service.enforce({ dimension, value: mobile, context: 'identifier' });

    const keys = await client!.keys('rl:v*:auth:otp-request:destination-15m:*');
    expect(keys.length).toBeGreaterThan(0);

    for (const key of keys) {
      expect(key).not.toContain(mobile);
    }
    const expectedHash = hashes.hash(mobile, 'identifier');
    expect(keys.some(key => key.includes(expectedHash))).toBe(true);
  });

  it('reset clears the current-window counter so the identifier can proceed', async context => {
    if (!available) return context.skip();
    const mobile = mobileFor('reset');
    const dimension = 'otp-request:destination-15m';

    await service.enforce({ dimension, value: mobile, context: 'identifier' });
    await service.enforce({ dimension, value: mobile, context: 'identifier' });
    await service.enforce({ dimension, value: mobile, context: 'identifier' });
    await expect(
      service.enforce({ dimension, value: mobile, context: 'identifier' }),
    ).rejects.toBeInstanceOf(RateLimitException);

    await service.reset({ dimension, value: mobile, context: 'identifier' });

    const afterReset = await service.enforce({ dimension, value: mobile, context: 'identifier' });
    expect(afterReset.allowed).toBe(true);
  });

  it('fails closed with UPSTREAM_UNAVAILABLE when the window is unreadable', async context => {
    if (!available) return context.skip();
    const broken = provideRedisClient('redis://127.0.0.1:1') as unknown as RedisClient;
    const downed = new RateLimitService(broken, hashes);

    await expect(
      downed.enforce({
        dimension: 'otp-request:ip-hour',
        value: '203.0.113.9',
        context: 'ip',
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});