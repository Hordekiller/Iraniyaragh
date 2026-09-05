import { LoginAttemptOutcome } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../database/prisma.service';
import { assertIsolatedTestDatabase } from '../../test/database-url.guard';
import type { RedisClient } from '../redis/redis.client';
import { provideRedisClient } from '../redis/redis.provider';
import { type AuthRuntimeConfig } from './auth.config';
import { AuthHashService } from './auth-hash.service';
import { CustomerOtpService, OTP_ATTEMPTS_LIMIT } from './customer-otp.service';
import { RATE_LIMIT_DEFINITIONS } from './rate-limit.config';
import { RateLimitException, RateLimitService } from './rate-limit.service';

const runtimeConfig: AuthRuntimeConfig = Object.freeze({
  accessSigningSecret: 'integration-access-secret-32-bytes-minimum-value',
  issuer: 'iranyaragh-otp-oververify-integration',
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

describe.sequential('CustomerOtpService 429-oververify database + live-Redis integration', () => {
  const prisma = new PrismaService();
  const hashes = new AuthHashService(runtimeConfig);
  let client: RedisProbe | null = null;
  let limits: RateLimitService;
  let otp: CustomerOtpService;
  let available = false;
  let connected = false;

  const createdUsers: string[] = [];

  beforeAll(async () => {
    assertIsolatedTestDatabase({
      databaseUrl: process.env.DATABASE_URL,
      nodeEnvironment: process.env.NODE_ENV,
    });
    await prisma.$connect();
    connected = true;

    client = await connectRedis();
    limits = new RateLimitService(client as unknown as RedisClient, hashes);
    otp = new CustomerOtpService(prisma, hashes, limits);
    available = client !== null;
  });

  afterAll(async () => {
    if (!connected) return;
    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { actorId: { in: createdUsers } },
          { entityId: { in: createdUsers } },
          { entityType: 'OtpCode' },
        ],
      },
    });
    await prisma.loginAttempt.deleteMany({ where: { userId: { in: createdUsers } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUsers } } });
    await prisma.$disconnect();
    if (client && client.status === 'ready') {
      await client.quit();
    }
  });

  function uniqueMobile(label: string): string {
    // E.164 Iranian form: +98 9 X X X X X X X X X (9 digits after the 9).
    const digit = String(label.length % 10);
    const filler = String(Math.floor(100_000_000 + Math.random() * 899_999_999)).slice(1);
    return `+989${digit}${filler}`;
  }

  function uniqueTestIp(label: string): string {
    // Documentation TEST-NET-3 range; each run mixes a fresh time-based octet so
    // failure counters from a prior run (60-minute Redis window) never leak in.
    const labelSeed = Math.abs([...label].reduce((acc, c) => (acc * 31 + c.charCodeAt(0)) % 251, 0));
    const octet = 1 + ((labelSeed + (Date.now() % 251)) % 251);
    return `203.0.113.${octet}`;
  }

  it('skips quietly when no live Redis is reachable', async context => {
    if (available) return;
    context.skip();
  });

  it('overflows the per-IP verification-failure window into a real 429 RATE_LIMITED over DB + live Redis', async context => {
    if (!available) return context.skip();
    const mobile = uniqueMobile('overflow');
    const ip = uniqueTestIp('overflow');

    const issued = await otp.requestOtp({ mobile, client: 'CUSTOMER_WEB' }, ip);
    const row = await prisma.otpCode.findUniqueOrThrow({ where: { id: issued.challengeId } });
    createdUsers.push(row.userId!);

    // Drive the failure path up to and through the limit against the same
    // challenge. The window is consumed by every failed verification
    // regardless of whether the challenge is still live (AUTH_CONTRACT §9).
    const IP_FAIL_LIMIT = RATE_LIMIT_DEFINITIONS['otp-verify:ip-fail-hour'].limit;
    let thrown: RateLimitException | undefined;

    for (let attempt = 0; attempt < IP_FAIL_LIMIT + 1; attempt += 1) {
      try {
        const result = await otp.verifyOtp({ challengeId: issued.challengeId, code: '000000' }, ip);
        expect(result.challenge.kind).toBe('invalid');
      } catch (error) {
        thrown = error as RateLimitException;
        break;
      }
    }

    expect(thrown).toBeInstanceOf(RateLimitException);
    expect(thrown!.getStatus()).toBe(429);
    expect(thrown!.getResponse()).toMatchObject({ code: 'RATE_LIMITED', statusCode: 429 });

    const retryAfter = thrown!.retryAfterSeconds;
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(3_600);

    // DB evidence: the in-window wrong codes wrote INVALID_CODE rows until the
    // challenge invalidated; the overflow itself is arbitrated in Redis.
    const failedEvidence = await prisma.loginAttempt.count({
      where: { userId: row.userId!, outcome: LoginAttemptOutcome.INVALID_CODE },
    });
    expect(failedEvidence).toBe(OTP_ATTEMPTS_LIMIT);

    const challengeAfter = await prisma.otpCode.findUniqueOrThrow({ where: { id: issued.challengeId } });
    expect(challengeAfter.invalidatedAt).not.toBeNull();

    // The overflowed window keeps rejecting until reset clears it (the
    // controller calls resetIpVerificationFailures after a successful login).
    await expect(otp.verifyOtp({ challengeId: issued.challengeId, code: '000000' }, ip)).rejects.toBeInstanceOf(
      RateLimitException,
    );

    await otp.resetIpVerificationFailures(ip);
    const afterReset = await otp.verifyOtp({ challengeId: issued.challengeId, code: '000000' }, ip);
    expect(afterReset.challenge.kind).toBe('invalid');
  });
});