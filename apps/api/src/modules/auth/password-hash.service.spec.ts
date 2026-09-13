import { describe, expect, it } from 'vitest';
import { PasswordHashService, PasswordPolicyError } from './password-hash.service';

describe('PasswordHashService', () => {
  it('enforces the Unicode length policy without trimming or normalization', () => {
    const service = new PasswordHashService();
    expect(() => service.assertPolicy('short')).toThrow(PasswordPolicyError);
    expect(() => service.assertPolicy('x'.repeat(129))).toThrow(PasswordPolicyError);
    expect(() => service.assertPolicy('😀'.repeat(14))).toThrow(PasswordPolicyError);
    expect(() => service.assertPolicy('😀'.repeat(15))).not.toThrow();
    expect(() => service.assertPolicy('۱۲۳۴۵۶۷۸۹۰۱۲۳۴۵')).not.toThrow();
  });

  it('rejects locally blocklisted common/compromised values case-insensitively', () => {
    const service = new PasswordHashService();
    expect(() => service.assertPolicy('password12345678')).toThrow(PasswordPolicyError);
    expect(() => service.assertPolicy('PASSWORD12345678')).toThrow(PasswordPolicyError);
    expect(() => service.assertPolicy('qwertyuiop123456')).toThrow(PasswordPolicyError);
    expect(() => service.assertPolicy('1234567890123456')).toThrow(PasswordPolicyError);
  });

  it('accepts a distinct long password that only resembles a blocklisted value', () => {
    const service = new PasswordHashService();
    expect(() => service.assertPolicy('password123456789!')).not.toThrow();
    expect(() => service.assertPolicy('qwertyuiopertyui')).not.toThrow();
  });

  it('blocks hashing a blocklisted password but rehashes an already-verified one', async () => {
    const service = new PasswordHashService();
    await expect(service.hash('password12345678')).rejects.toBeInstanceOf(PasswordPolicyError);

    const rehash = await service.hashForLoginRehash('password12345678');
    expect(rehash.startsWith('$argon2id$')).toBe(true);
    await expect(service.verify(rehash, 'password12345678')).resolves.toBe(true);
  });

  it('uses Argon2id and verifies only the exact password', async () => {
    const service = new PasswordHashService();
    const password = 'A secure password with unicode ی';
    const hash = await service.hash(password);

    expect(hash.startsWith('$argon2id$')).toBe(true);
    await expect(service.verify(hash, password)).resolves.toBe(true);
    await expect(service.verify(hash, `${password} `)).resolves.toBe(false);
    await expect(service.verify(undefined, password)).resolves.toBe(false);
  });
});
