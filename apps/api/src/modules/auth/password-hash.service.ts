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
    if (typeof password !== 'string') throw new PasswordPolicyError();
    // Count Unicode code points (not UTF-16 code units) for both bounds so the
    // runtime policy matches the bootstrap script and the DTO validator.
    const length = Array.from(password).length;
    if (length < PASSWORD_MIN_LENGTH || length > PASSWORD_MAX_LENGTH) {
      throw new PasswordPolicyError();
    }
  }
}

export const STAFF_PASSWORD_MIN_LENGTH = PASSWORD_MIN_LENGTH;
export const STAFF_PASSWORD_MAX_LENGTH = PASSWORD_MAX_LENGTH;
