import { describe, expect, it } from 'vitest';
import { StaffAuthFixtureClient } from '../staff-fixture';
import { StaffAuthError } from '../staff-api';

const IDENTIFIER = 'ops@iranyaragh.local';
const PASSWORD = 'FixtuRe-E2E-Admin!2026';
const TOTP = '654321';

function makeFixture(nowValue = 1_000) {
  let now = nowValue;
  const fixture = new StaffAuthFixtureClient({
    identifier: IDENTIFIER,
    password: PASSWORD,
    totpCode: TOTP,
    retryAfterSeconds: 0, // 0 => lock-out releases immediately, with the UI reading retryAfter
    now: () => now,
  });
  return { fixture, setNow: (t: number) => (now = t) };
}

async function login(
  fixture: StaffAuthFixtureClient,
  identifier = IDENTIFIER,
  password = PASSWORD,
  code = TOTP,
) {
  const challenge = await fixture.passwordRequest({ identifier, password });
  return fixture.totpVerify({ challengeToken: challenge.challengeToken, code });
}

describe('StaffAuthFixtureClient passwordRequest', () => {
  it('returns a TOTP challenge with the contract TTL', async () => {
    const { fixture } = makeFixture();
    const challenge = await fixture.passwordRequest({ identifier: IDENTIFIER, password: PASSWORD });
    expect(challenge.next).toBe('TOTP');
    expect(challenge.expiresInSeconds).toBe(300);
    expect(challenge.challengeToken).not.toBe('');
  });

  it('rejects a wrong password with AUTH_INVALID_CREDENTIALS', async () => {
    const { fixture } = makeFixture();
    await expect(
      fixture.passwordRequest({ identifier: IDENTIFIER, password: 'wrong' }),
    ).rejects.toMatchObject({ code: 'AUTH_INVALID_CREDENTIALS', statusCode: 401 });
  });

  it('rejects an unknown identifier with the identical AUTH_INVALID_CREDENTIALS (no enumeration)', async () => {
    const { fixture } = makeFixture();
    let unknown: unknown;
    let wrongPassword: unknown;
    try {
      await fixture.passwordRequest({ identifier: 'nobody@example.com', password: 'x' });
    } catch (error) {
      unknown = error;
    }
    try {
      await fixture.passwordRequest({ identifier: IDENTIFIER, password: 'x' });
    } catch (error) {
      wrongPassword = error;
    }
    expect(unknown).toBeInstanceOf(StaffAuthError);
    expect(wrongPassword).toBeInstanceOf(StaffAuthError);
    expect((unknown as StaffAuthError).code).toBe('AUTH_INVALID_CREDENTIALS');
    expect((wrongPassword as StaffAuthError).code).toBe('AUTH_INVALID_CREDENTIALS');
    expect((unknown as StaffAuthError).message).toBe((wrongPassword as StaffAuthError).message);
  });

  it('locks out after max password attempts with RATE_LIMITED', async () => {
    const { fixture } = makeFixture();
    for (let i = 0; i < 4; i += 1) {
      await expect(
        fixture.passwordRequest({ identifier: IDENTIFIER, password: 'wrong' }),
      ).rejects.toMatchObject({ code: 'AUTH_INVALID_CREDENTIALS' });
    }
    await expect(
      fixture.passwordRequest({ identifier: IDENTIFIER, password: 'wrong' }),
    ).rejects.toMatchObject({ code: 'RATE_LIMITED', statusCode: 429, retryAfterSeconds: 0 });
  });

  it('accepts a valid password again after the lock-out window has passed', async () => {
    const { fixture, setNow } = makeFixture();
    for (let i = 0; i < 5; i += 1) {
      await fixture.passwordRequest({ identifier: IDENTIFIER, password: 'wrong' }).catch(() => undefined);
    }
    setNow(2_000); // retryAfterSeconds is 0 => back-off already elapsed
    await expect(
      fixture.passwordRequest({ identifier: IDENTIFIER, password: PASSWORD }),
    ).resolves.toMatchObject({ next: 'TOTP' });
  });
});

describe('StaffAuthFixtureClient totpVerify', () => {
  it('rejects an invalid code with AUTH_CHALLENGE_INVALID', async () => {
    const { fixture } = makeFixture();
    const challenge = await fixture.passwordRequest({ identifier: IDENTIFIER, password: PASSWORD });
    await expect(
      fixture.totpVerify({ challengeToken: challenge.challengeToken, code: '000000' }),
    ).rejects.toMatchObject({ code: 'AUTH_CHALLENGE_INVALID' });
  });

  it('rejects a stale or foreign challenge token', async () => {
    const { fixture } = makeFixture();
    await fixture.passwordRequest({ identifier: IDENTIFIER, password: PASSWORD });
    await expect(
      fixture.totpVerify({ challengeToken: 'someone-else', code: TOTP }),
    ).rejects.toMatchObject({ code: 'AUTH_CHALLENGE_INVALID' });
  });

  it('reacts to expiry with AUTH_CHALLENGE_EXPIRED', async () => {
    const { fixture, setNow } = makeFixture();
    const challenge = await fixture.passwordRequest({ identifier: IDENTIFIER, password: PASSWORD });
    setNow(1_000 + 301_000); // past the 300 s TTL
    await expect(
      fixture.totpVerify({ challengeToken: challenge.challengeToken, code: TOTP }),
    ).rejects.toMatchObject({ code: 'AUTH_CHALLENGE_EXPIRED' });
  });

  it('rejects a non-six-digit code with VALIDATION_ERROR', async () => {
    const { fixture } = makeFixture();
    const challenge = await fixture.passwordRequest({ identifier: IDENTIFIER, password: PASSWORD });
    await expect(
      fixture.totpVerify({ challengeToken: challenge.challengeToken, code: '123' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR', statusCode: 422 });
  });

  it('is single use: a verified challenge cannot be reused', async () => {
    const { fixture } = makeFixture();
    const challenge = await fixture.passwordRequest({ identifier: IDENTIFIER, password: PASSWORD });
    const data = await fixture.totpVerify({ challengeToken: challenge.challengeToken, code: TOTP });
    expect(data.principal.authenticationLevel).toBe('STAFF_MFA');
    await expect(
      fixture.totpVerify({ challengeToken: challenge.challengeToken, code: TOTP }),
    ).rejects.toMatchObject({ code: 'AUTH_CHALLENGE_INVALID' });
  });

  it('issues a Bearer token with the staff principal on success', async () => {
    const { fixture } = makeFixture();
    const data = await login(fixture);
    expect(data.tokenType).toBe('Bearer');
    expect(data.expiresInSeconds).toBe(600);
    expect(data.principal.userId).toBe(IDENTIFIER);
    expect(data.principal.authenticationLevel).toBe('STAFF_MFA');
    expect(data.principal.permissions).toContain('admin.dashboard.read');
    expect(data.accessToken.startsWith('fixture-staff-at.')).toBe(true);
  });
});

describe('StaffAuthFixtureClient session lifecycle', () => {
  it('me() throws AUTH_SESSION_INVALID before sign-in and after logout', async () => {
    const { fixture } = makeFixture();
    await expect(fixture.me()).rejects.toMatchObject({ code: 'AUTH_SESSION_INVALID' });
    await login(fixture);
    await fixture.logout();
    await expect(fixture.me()).rejects.toMatchObject({ code: 'AUTH_SESSION_INVALID' });
  });

  it('me() returns the principal while signed in', async () => {
    const { fixture } = makeFixture();
    const { principal } = await login(fixture);
    await expect(fixture.me()).resolves.toEqual(principal);
  });

  it('revoke() makes me() fail closed with FORBIDDEN', async () => {
    const { fixture } = makeFixture();
    await login(fixture);
    fixture.revoke();
    await expect(fixture.me()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});