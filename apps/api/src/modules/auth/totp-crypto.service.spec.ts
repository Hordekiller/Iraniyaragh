import { describe, expect, it } from 'vitest';
import type { AuthRuntimeConfig } from './auth.config';
import { TotpCryptoService } from './totp-crypto.service';

function config(key?: string): AuthRuntimeConfig {
  return {
    accessSigningSecret: 'access-secret-at-least-thirty-two-bytes',
    issuer: 'iranyaragh-test',
    audience: 'iranyaragh-browser',
    accessTokenTtlSeconds: 600,
    clockToleranceSeconds: 30,
    currentHashKey: { version: 1, secret: 'secret'.repeat(8) },
    devLoginEnabled: false,
    devCode: '',
    ...(key ? { totpEncryptionKey: key } : {}),
    cookies: {
      refreshName: 'refresh',
      csrfName: 'csrf',
      secure: false,
      sameSite: 'strict',
      path: '/',
    },
  };
}

describe('TotpCryptoService', () => {
  it('encrypts and decrypts TOTP secrets with an authenticated envelope', () => {
    const service = new TotpCryptoService(config(Buffer.alloc(32, 7).toString('base64url')));
    const encrypted = service.encrypt('JBSWY3DPEHPK3PXP');

    expect(encrypted.encryptedSecret).not.toContain('JBSWY3DPEHPK3PXP');
    expect(service.decrypt(encrypted.encryptedSecret)).toBe('JBSWY3DPEHPK3PXP');
  });

  it('fails closed when the encryption key is absent', () => {
    const service = new TotpCryptoService(config());
    expect(() => service.encrypt('secret')).toThrow();
  });
});
