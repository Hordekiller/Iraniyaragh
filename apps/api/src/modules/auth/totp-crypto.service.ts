import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { AUTH_RUNTIME_CONFIG, type AuthRuntimeConfig } from './auth.config';

const ENVELOPE_VERSION = 'v1';
const KEY_BYTES = 32;

@Injectable()
export class TotpCryptoService {
  constructor(@Inject(AUTH_RUNTIME_CONFIG) private readonly config: AuthRuntimeConfig) {}

  encrypt(secret: string): { encryptedSecret: string; encryptionKeyVersion: string } {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key(), iv);
    const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return {
      encryptedSecret: [ENVELOPE_VERSION, iv.toString('base64url'), tag.toString('base64url'), ciphertext.toString('base64url')].join(':'),
      encryptionKeyVersion: ENVELOPE_VERSION,
    };
  }

  decrypt(envelope: string): string {
    const [version, ivEncoded, tagEncoded, ciphertextEncoded] = envelope.split(':');
    if (version !== ENVELOPE_VERSION || !ivEncoded || !tagEncoded || !ciphertextEncoded) {
      throw new ServiceUnavailableException({ code: 'UPSTREAM_UNAVAILABLE', message: 'Authentication security configuration is unavailable.' });
    }
    try {
      const decipher = createDecipheriv('aes-256-gcm', this.key(), Buffer.from(ivEncoded, 'base64url'));
      decipher.setAuthTag(Buffer.from(tagEncoded, 'base64url'));
      return Buffer.concat([decipher.update(Buffer.from(ciphertextEncoded, 'base64url')), decipher.final()]).toString('utf8');
    } catch {
      throw new ServiceUnavailableException({ code: 'UPSTREAM_UNAVAILABLE', message: 'Authentication security configuration is unavailable.' });
    }
  }

  private key(): Buffer {
    const value = this.config.totpEncryptionKey;
    if (!value) {
      throw new ServiceUnavailableException({ code: 'UPSTREAM_UNAVAILABLE', message: 'Authentication security configuration is unavailable.' });
    }
    const key = /^[0-9a-f]{64}$/iu.test(value) ? Buffer.from(value, 'hex') : Buffer.from(value, 'base64url');
    if (key.length !== KEY_BYTES) {
      throw new ServiceUnavailableException({ code: 'UPSTREAM_UNAVAILABLE', message: 'Authentication security configuration is unavailable.' });
    }
    return key;
  }
}
