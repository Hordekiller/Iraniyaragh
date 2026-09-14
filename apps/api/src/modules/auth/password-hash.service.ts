import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

const PASSWORD_MIN_LENGTH = 15;
const PASSWORD_MAX_LENGTH = 128;
const ARGON_OPTIONS: argon2.HashOptions = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

/**
 * Curated local blocklist of common/compromised values that clear the 15–128
 * character length bar but are trivially guessable (AUTH_CONTRACT §10). This is
 * an embedded first line of defense for credential-stuffing; values are matched
 * case-insensitively and no password ever leaves the process. Scaling to a
 * larger offline source is an operations concern.
 */
const BLOCKLISTED_COMMON_PASSWORDS = Object.freeze([
  'password',
  'password123',
  'password123456',
  'password1234567',
  'password12345678',
  'password123456789',
  'passw0rd',
  'admin123',
  'admin123456',
  'admin123456789',
  '123456789',
  '1234567890',
  '123456789012345',
  '1234567890123456',
  'qwertyuiop',
  'qwertyuiop123',
  'qwertyuiop123456',
  'qwertyuiopasdfgh',
  'asdfghjkl',
  'asdfghjkl123456',
  'asdfghjklqwertyu',
  'zxcvbnm',
  'zxcvbnm123456789',
  '1q2w3e4r5t6y7u8i',
  'q1w2e3r4t5y6u7i8',
  'letmein',
  'letmein123456',
  'letmein123456789',
  'welcome',
  'welcome123456789',
  'iloveyou',
  'iloveyou123456',
  'iloveyou12345678',
  'monkey',
  'monkey1234567890',
  'dragon',
  'dragon1234567890',
  'football',
  'football12345678',
  'baseball',
  'baseball12345678',
  'superman',
  'superman123456789',
  'trustno1',
  'trustno1123456789',
  'shadow1234567890',
  'master1234567890',
  'access1234567890',
  'secret1234567890',
  'sunshine12345678',
  'princess12345678',
] as const);

const BLOCKLISTED_PASSWORDS = new Set<string>(BLOCKLISTED_COMMON_PASSWORDS);

export class PasswordPolicyError extends Error {
  constructor() {
    super('Password does not satisfy the authentication policy.');
    this.name = 'PasswordPolicyError';
  }
}

@Injectable()
export class PasswordHashService {
  private readonly dummyHashPromise = argon2.hash(randomBytes(32).toString('base64url'), ARGON_OPTIONS);

  async hash(password: string): Promise<string> {
    this.assertPolicy(password);
    return argon2.hash(password, { ...ARGON_OPTIONS, raw: false });
  }

  /**
   * Hashes an already-verified password to transparently upgrade a stale hash
   * during login. Set-time policy (including the blocklist) is intentionally
   * bypassed here: the credential was just verified, and rejecting it now could
   * lock a user out. Policy is enforced at credential creation/change.
   */
  async hashForLoginRehash(password: string): Promise<string> {
    return argon2.hash(password, { ...ARGON_OPTIONS, raw: false });
  }

  async verify(storedHash: string | null | undefined, password: string): Promise<boolean> {
    const target = storedHash ?? (await this.dummyHashPromise);
    try {
      return await argon2.verify(target, password, ARGON_OPTIONS);
    } catch {
      return false;
    }
  }

  needsRehash(storedHash: string): boolean {
    try {
      return argon2.needsRehash(storedHash, {
        memoryCost: ARGON_OPTIONS.memoryCost,
        timeCost: ARGON_OPTIONS.timeCost,
        parallelism: ARGON_OPTIONS.parallelism,
      });
    } catch {
      return true;
    }
  }

  assertPolicy(password: string): void {
    if (typeof password !== 'string') {
      throw new PasswordPolicyError();
    }
    const length = Array.from(password).length;
    if (length < PASSWORD_MIN_LENGTH || length > PASSWORD_MAX_LENGTH) {
      throw new PasswordPolicyError();
    }
    if (BLOCKLISTED_PASSWORDS.has(password.toLowerCase())) {
      throw new PasswordPolicyError();
    }
  }
}

export const STAFF_PASSWORD_MIN_LENGTH = PASSWORD_MIN_LENGTH;
export const STAFF_PASSWORD_MAX_LENGTH = PASSWORD_MAX_LENGTH;
