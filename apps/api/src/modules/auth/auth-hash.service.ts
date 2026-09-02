import { createHmac, hkdfSync, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { AUTH_RUNTIME_CONFIG, type AuthHashKey, type AuthRuntimeConfig } from './auth.config';

export type AuthHashContext = 'device' | 'identifier' | 'ip' | 'mfa-challenge' | 'otp' | 'refresh';

const HASH_PREFIX_PATTERN = /^v([1-9]\d*):([A-Za-z0-9_-]{43})$/u;
const DERIVED_KEY_BYTES = 32;
const MAX_HASH_INPUT_BYTES = 4096;
const HKDF_SALT = Buffer.from('iranyaragh:auth:hkdf:v1', 'utf8');

@Injectable()
export class AuthHashService {
  private readonly derivedKeys = new Map<string, Buffer>();

  constructor(
    @Inject(AUTH_RUNTIME_CONFIG)
    private readonly config: AuthRuntimeConfig,
  ) {}

  hash(value: string, context: AuthHashContext): string {
    return this.hashWithKey(this.requireValue(value), context, this.config.currentHashKey);
  }

  candidateHashes(value: string, context: AuthHashContext): readonly string[] {
    const safeValue = this.requireValue(value);
    const candidates = [this.hashWithKey(safeValue, context, this.config.currentHashKey)];
    if (this.config.previousHashKey) {
      candidates.push(this.hashWithKey(safeValue, context, this.config.previousHashKey));
    }
    return Object.freeze(candidates);
  }

  verify(value: string, encodedHash: string, context: AuthHashContext): boolean {
    if (typeof value !== 'string' || value.length === 0 || Buffer.byteLength(value, 'utf8') > MAX_HASH_INPUT_BYTES) {
      return false;
    }
    const match = HASH_PREFIX_PATTERN.exec(encodedHash);
    if (!match) return false;

    const version = Number(match[1]);
    const key = [this.config.currentHashKey, this.config.previousHashKey].find(
      candidate => candidate?.version === version,
    );
    if (!key) return false;

    const suppliedDigest = Buffer.from(match[2], 'base64url');
    const expectedDigest = this.digest(value, context, key);
    return suppliedDigest.length === expectedDigest.length && timingSafeEqual(suppliedDigest, expectedDigest);
  }

  private hashWithKey(value: string, context: AuthHashContext, key: AuthHashKey): string {
    return `v${key.version}:${this.digest(value, context, key).toString('base64url')}`;
  }

  private digest(value: string, context: AuthHashContext, key: AuthHashKey): Buffer {
    return createHmac('sha256', this.derivedKey(context, key)).update(value, 'utf8').digest();
  }

  private derivedKey(context: AuthHashContext, key: AuthHashKey): Buffer {
    const cacheKey = `${key.version}:${context}`;
    const cached = this.derivedKeys.get(cacheKey);
    if (cached) return cached;

    const derived = Buffer.from(
      hkdfSync(
        'sha256',
        Buffer.from(key.secret, 'utf8'),
        HKDF_SALT,
        Buffer.from(`iranyaragh:auth:${context}`, 'utf8'),
        DERIVED_KEY_BYTES,
      ),
    );
    this.derivedKeys.set(cacheKey, derived);
    return derived;
  }

  private requireValue(value: string): string {
    if (typeof value !== 'string' || value.length === 0 || Buffer.byteLength(value, 'utf8') > MAX_HASH_INPUT_BYTES) {
      throw new TypeError('Auth hash input must be a non-empty string of at most 4096 bytes.');
    }
    return value;
  }
}
