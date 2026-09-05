import { HttpException, ServiceUnavailableException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RedisClient } from '../redis/redis.client';
import { AuthHashService } from './auth-hash.service';
import type { AuthRuntimeConfig } from './auth.config';
import { RateLimitException, RateLimitService } from './rate-limit.service';

const runtimeConfig: AuthRuntimeConfig = Object.freeze({
  accessSigningSecret: 'x',
  issuer: 'iranyaragh-test',
  audience: 'iranyaragh-browser',
  accessTokenTtlSeconds: 600,
  clockToleranceSeconds: 30,
  currentHashKey: Object.freeze({ version: 1, secret: 'secret'.repeat(8) }),
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

function createService(overrides: {
  eval?: (script: string, numKeys: number, ...args: string[]) => Promise<unknown>;
  del?: (...keys: string[]) => Promise<number>;
} = {}) {
  const client = {
    status: 'ready',
    eval: vi.fn(overrides.eval ?? (async () => [1, 60_000])),
    del: vi.fn(overrides.del ?? (async () => 1)),
  } as unknown as RedisClient;
  const hashes = new AuthHashService(runtimeConfig);
  const service = new RateLimitService(client, hashes);
  return { service, client, hashes };
}

describe('RateLimitService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('enforce', () => {
    it('allows calls within the limit and reports remaining', async () => {
      const { service, client } = createService({ eval: async () => [1, 60_000] });
      const decision = await service.enforce({
        dimension: 'otp-request:destination',
        value: '+989123456789',
        context: 'identifier',
      });

      expect(decision.allowed).toBe(true);
      expect(decision.limit).toBe(1);
      expect(decision.remaining).toBe(0);
      expect(client.eval).toHaveBeenCalledTimes(1);
    });

    it('throws RATE_LIMITED with bounded retry-after when the limit is exceeded', async () => {
      const { service } = createService({ eval: async () => [3, 40_000] });
      const promise = service.enforce({
        dimension: 'otp-request:destination',
        value: '+989123456789',
        context: 'identifier',
      });

      await expect(promise).rejects.toBeInstanceOf(RateLimitException);
      try {
        await promise;
      } catch (error) {
        const exception = error as RateLimitException;
        expect(exception.getStatus()).toBe(429);
        expect(exception.retryAfterSeconds).toBe(40);
      }
    });

    it('uses a versioned, hashed key derived from the value', async () => {
      const { service, client, hashes } = createService();
      await service.enforce({
        dimension: 'otp-request:destination',
        value: '+989123456789',
        context: 'identifier',
      });

      const [script, numKeys, key, expirArg] = client.eval.mock.calls[0] as [string, number, string, string];
      expect(numKeys).toBe(1);
      expect(expirArg).toBe(String(60 * 1_000));
      expect(key).toContain('rl:v1:auth:otp-request:destination:');
      const expectedHash = hashes.hash('+989123456789', 'identifier');
      expect(key).toContain(expectedHash);
      expect(script).toContain('INCR');
    });

    it('fails closed with UPSTREAM_UNAVAILABLE when Redis errors', async () => {
      const { service } = createService({ eval: async () => {
        throw new Error('redis down');
      } });
      await expect(
        service.enforce({
          dimension: 'otp-request:destination',
          value: '+989123456789',
          context: 'identifier',
        }),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      try {
        await service.enforce({
          dimension: 'otp-request:destination',
          value: '+989123456789',
          context: 'identifier',
        });
      } catch (error) {
        const exception = error as ServiceUnavailableException;
        expect(exception.getStatus()).toBe(503);
        const response = exception.getResponse() as { code: string };
        expect(response.code).toBe('UPSTREAM_UNAVAILABLE');
      }
    });

    it('uses the ip hash context for IP dimensions', async () => {
      const { service, client } = createService();
      await service.enforce({
        dimension: 'otp-request:ip-hour',
        value: '203.0.113.7',
        context: 'ip',
      });

      const [, , key] = client.eval.mock.calls[0] as [string, number, string];
      expect(key).toContain('otp-request:ip-hour:');
    });
  });

  describe('reset', () => {
    it('deletes the current-window key for the dimension/value', async () => {
      const { service, client, hashes } = createService();
      await service.reset({
        dimension: 'otp-verify:ip-fail-hour',
        value: '203.0.113.7',
        context: 'ip',
      });

      const key = client.del.mock.calls[0]?.[0] as string;
      expect(key).toContain('rl:v1:auth:otp-verify:ip-fail-hour:');
      expect(key).toContain(hashes.hash('203.0.113.7', 'ip'));
    });
  });

  describe('exception shape', () => {
    it('RateLimitException carries a stable public code and status', () => {
      const exception = new RateLimitException(45);
      expect(exception.getStatus()).toBe(429);
      expect(exception.getResponse()).toMatchObject({
        code: 'RATE_LIMITED',
        statusCode: 429,
      });
      expect(exception).toBeInstanceOf(HttpException);
    });
  });
});