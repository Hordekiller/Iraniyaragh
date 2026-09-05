import { LoginAttemptOutcome, OtpPurpose, UserStatus } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../database/prisma.service';
import { assertIsolatedTestDatabase } from '../../test/database-url.guard';
import { type AuthRuntimeConfig } from './auth.config';
import { AuthHashService } from './auth-hash.service';
import { CustomerOtpService, OTP_ATTEMPTS_LIMIT, OTP_TTL_SECONDS } from './customer-otp.service';
import { type RateLimitService } from './rate-limit.service';

const runtimeConfig: AuthRuntimeConfig = Object.freeze({
  accessSigningSecret: 'integration-access-secret-32-bytes-minimum-value',
  issuer: 'iranyaragh-customer-otp-integration',
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

function removableLimiter(): Pick<RateLimitService, 'enforce' | 'reset'> {
  return {
    enforce: async () =>
      Object.freeze({
        allowed: true,
        limit: 1,
        remaining: 0,
        retryAfterSeconds: 0,
        windowSeconds: 60,
      }),
    reset: async () => undefined,
  };
}

function testMobile(prefix: string): string {
  return `+989${prefix}${String(Math.floor(100_000 + Math.random() * 899_999))}`;
}

describe.sequential('CustomerOtpService database integration', () => {
  const prisma = new PrismaService();
  const hashes = new AuthHashService(runtimeConfig);
  const otp = new CustomerOtpService(prisma, hashes, removableLimiter() as unknown as RateLimitService);
  let connected = false;

  const createdUsers: string[] = [];

  beforeAll(async () => {
    assertIsolatedTestDatabase({
      databaseUrl: process.env.DATABASE_URL,
      nodeEnvironment: process.env.NODE_ENV,
    });
    await prisma.$connect();
    connected = true;
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
  });

  async function requestOtpAndRecoverCode(mobile: string, ip: string): Promise<{ challengeId: string; code: string }> {
    const issued = await otp.requestOtp({ mobile, client: 'CUSTOMER_WEB' }, ip);
    const row = await prisma.otpCode.findUniqueOrThrow({ where: { id: issued.challengeId } });
    const code = bruteForceOtpCode(hashes, row.codeHash);
    return { challengeId: issued.challengeId, code };
  }

  it('requests an OTP for a new mobile, persisting only hashes and safe audit metadata', async () => {
    const mobile = testMobile('120');
    const issued = await otp.requestOtp({ mobile, client: 'CUSTOMER_WEB' }, '192.0.2.20');

    expect(issued.expiresInSeconds).toBe(OTP_TTL_SECONDS);
    expect(issued.resendAfterSeconds).toBe(60);

    const stored = await prisma.otpCode.findUniqueOrThrow({ where: { id: issued.challengeId } });
    const user = await prisma.user.findUniqueOrThrow({ where: { mobile } });
    createdUsers.push(user.id);

    expect(user.status).toBe(UserStatus.PENDING);
    expect(stored.destinationHash).not.toContain(mobile);
    expect(hashes.verify(mobile, stored.destinationHash, 'identifier')).toBe(true);
    expect(stored).toMatchObject({
      userId: user.id,
      purpose: OtpPurpose.SIGN_IN,
      maxAttempts: OTP_ATTEMPTS_LIMIT,
    });

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'auth.otp.requested', entityId: user.id },
    });
    const serializedAudit = JSON.stringify(audit);
    expect(serializedAudit).not.toContain(mobile);
    expect(serializedAudit).not.toContain('192.0.2.20');
  });

  it('resend invalidates the previously issued active challenge for the same destination', async () => {
    const mobile = testMobile('121');
    const first = await requestOtpAndRecoverCode(mobile, '192.0.2.21');
    const second = await requestOtpAndRecoverCode(mobile, '192.0.2.21');

    const firstRow = await prisma.otpCode.findUniqueOrThrow({ where: { id: first.challengeId } });
    expect(firstRow.invalidatedAt).not.toBeNull();

    const user = await prisma.user.findUniqueOrThrow({ where: { mobile } });
    createdUsers.push(user.id);

    const result = await otp.verifyOtp(
      { challengeId: first.challengeId, code: first.code },
      '192.0.2.21',
    );
    expect(result.challenge.kind).toBe('invalid');

    const verification = await otp.verifyOtp(
      { challengeId: second.challengeId, code: second.code },
      '192.0.2.21',
    );
    expect(verification.challenge.kind).toBe('success');
  });

  it('activates a pending user on a correct code and records success audit evidence', async () => {
    const mobile = testMobile('122');
    const { challengeId, code } = await requestOtpAndRecoverCode(mobile, '192.0.2.22');
    const userBefore = await prisma.user.findUniqueOrThrow({ where: { mobile } });
    createdUsers.push(userBefore.id);

    const result = await otp.verifyOtp({ challengeId, code, deviceName: '  Test device  ' }, '192.0.2.22');
    expect(result.challenge.kind).toBe('success');

    const user = await prisma.user.findUniqueOrThrow({ where: { mobile } });
    expect(user.status).toBe(UserStatus.ACTIVE);
    expect(user.isMobileVerified).toBe(true);
    expect(user.mobileVerifiedAt).not.toBeNull();

    const successAttempts = await prisma.loginAttempt.count({
      where: { userId: user.id, outcome: LoginAttemptOutcome.SUCCESS },
    });
    expect(successAttempts).toBe(1);

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'auth.otp.verified', entityId: user.id },
    });
    const serializedAudit = JSON.stringify(audit);
    expect(serializedAudit).not.toContain(code);
    expect(serializedAudit).not.toContain(mobile);
  });

  it('invalidates the challenge after the configured retry limit, even for the correct code', async () => {
    const { challengeId, code } = await requestOtpAndRecoverCode(testMobile('123'), '192.0.2.23');
    const challenge = await prisma.otpCode.findUniqueOrThrow({ where: { id: challengeId } });
    createdUsers.push(challenge.userId!);

    for (let attempt = 0; attempt < OTP_ATTEMPTS_LIMIT; attempt += 1) {
      const failed = await otp.verifyOtp({ challengeId, code: '000000' }, '192.0.2.23');
      expect(failed.challenge.kind).toBe('invalid');
    }

    const terminalCorrect = await otp.verifyOtp({ challengeId, code }, '192.0.2.23');
    expect(terminalCorrect.challenge.kind).toBe('invalid');

    const nowTerminal = await prisma.otpCode.findUniqueOrThrow({ where: { id: challengeId } });
    expect(nowTerminal.invalidatedAt).not.toBeNull();
    expect(nowTerminal.consumedAt).toBeNull();

    const failedAttempts = await prisma.loginAttempt.count({
      where: { userId: challenge.userId!, outcome: LoginAttemptOutcome.INVALID_CODE },
    });
    expect(failedAttempts).toBe(OTP_ATTEMPTS_LIMIT);
  });

  it('rejects a challenged user in a non-activatable lifecycle state with a generic failure', async () => {
    const mobile = testMobile('124');
    const { challengeId, code } = await requestOtpAndRecoverCode(mobile, '192.0.2.24');
    const user = await prisma.user.findUniqueOrThrow({ where: { mobile } });
    createdUsers.push(user.id);
    await prisma.user.update({ where: { id: user.id }, data: { status: UserStatus.SUSPENDED } });

    const result = await otp.verifyOtp({ challengeId, code }, '192.0.2.24');
    expect(result.challenge.kind).toBe('invalid');

    const suspendedUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(suspendedUser.status).toBe(UserStatus.SUSPENDED);

    const attempts = await prisma.loginAttempt.count({
      where: { userId: user.id, outcome: LoginAttemptOutcome.ACCOUNT_SUSPENDED },
    });
    expect(attempts).toBe(1);

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'auth.otp.failed', entityId: challengeId },
    });
    expect(audit.metadata).toMatchObject({ outcome: LoginAttemptOutcome.ACCOUNT_SUSPENDED });
  });

  it('consumes a single-use challenge atomically so two concurrent verifications yield one session', async () => {
    const mobile = testMobile('125');
    const { challengeId, code } = await requestOtpAndRecoverCode(mobile, '192.0.2.25');
    const user = await prisma.user.findUniqueOrThrow({ where: { mobile } });
    createdUsers.push(user.id);

    const outcomes = await Promise.all([
      otp.verifyOtp({ challengeId, code }, '192.0.2.25'),
      otp.verifyOtp({ challengeId, code }, '192.0.2.25'),
    ]);

    const successes = outcomes.filter(result => result.challenge.kind === 'success').length;
    expect(successes).toBe(1);

    const row = await prisma.otpCode.findUniqueOrThrow({ where: { id: challengeId } });
    expect(row.consumedAt).not.toBeNull();

    const verifiedAudits = await prisma.auditLog.count({
      where: { action: 'auth.otp.verified', entityId: user.id },
    });
    expect(verifiedAudits).toBe(1);
  });
});

function bruteForceOtpCode(hashes: AuthHashService, codeHash: string): string {
  for (let candidate = 0; candidate < 1_000_000; candidate += 1) {
    const value = String(candidate).padStart(6, '0');
    if (hashes.verify(value, codeHash, 'otp')) return value;
  }
  throw new Error('Unable to recover the OTP code hash in the integration test.');
}