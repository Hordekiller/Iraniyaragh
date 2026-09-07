import { describe, expect, it } from 'vitest';
import { PasswordHashService, PasswordPolicyError } from './password-hash.service';

describe('PasswordHashService', () => {
  it('enforces the Unicode length policy without trimming or normalization', () => {
    const service = new PasswordHashService();
    expect(() => service.assertPolicy('short')).toThrow(PasswordPolicyError);
    expect(() => service.assertPolicy('x'.repeat(129))).toThrow(PasswordPolicyError);
    expect(() => service.assertPolicy('۱۲۳۴۵۶۷۸۹۰۱۲۳۴۵')).not.toThrow();
  });

  it('counts Unicode code points for both min and max bounds', () => {
    const service = new PasswordHashService();
    // 𝒜 (U+1D49C) is a surrogate pair: length 2 in UTF-16, 1 code point.
    const astral = ' 𝒜'.repeat(7).trim();
    // 14 code points, 26 UTF-16 code units — the old min (UTF-16) would accept
    // this; the new min (code points) must reject it (too short).
    expect(() => service.assertPolicy(astral)).toThrow(PasswordPolicyError);
    // 16 astral code points = 30 UTF-16 code units; within [15,128] code points.
    const validAstral = ' 𝒜'.repeat(8).trim();
    expect(() => service.assertPolicy(validAstral)).not.toThrow();
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
