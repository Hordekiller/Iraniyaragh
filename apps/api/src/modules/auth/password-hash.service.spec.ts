import { describe, expect, it } from 'vitest';
import { PasswordHashService, PasswordPolicyError } from './password-hash.service';

describe('PasswordHashService', () => {
  it('enforces the Unicode length policy without trimming or normalization', () => {
    const service = new PasswordHashService();
    expect(() => service.assertPolicy('short')).toThrow(PasswordPolicyError);
    expect(() => service.assertPolicy('x'.repeat(129))).toThrow(PasswordPolicyError);
    expect(() => service.assertPolicy('۱۲۳۴۵۶۷۸۹۰۱۲۳۴۵')).not.toThrow();
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
