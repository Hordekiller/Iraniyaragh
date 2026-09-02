import { describe, expect, it } from 'vitest';
import type { AuthRuntimeConfig } from './auth.config';
import { AuthHashService } from './auth-hash.service';

const config: AuthRuntimeConfig = {
  accessSigningSecret: 'access-signing-secret-not-used-by-hash-tests',
  issuer: 'iranyaragh-api-test',
  audience: 'iranyaragh-browser',
  accessTokenTtlSeconds: 600,
  clockToleranceSeconds: 30,
  currentHashKey: {
    version: 8,
    secret: 'current-hash-root-secret-0123456789abcdef',
  },
  previousHashKey: {
    version: 7,
    secret: 'previous-hash-root-secret-0123456789abcde',
  },
};

describe('AuthHashService', () => {
  const service = new AuthHashService(config);

  it('creates deterministic versioned HMAC hashes without exposing the input', () => {
    const value = 'opaque-refresh-token-value';
    const first = service.hash(value, 'refresh');
    const second = service.hash(value, 'refresh');

    expect(first).toBe(second);
    expect(first).toMatch(/^v8:[A-Za-z0-9_-]{43}$/u);
    expect(first).not.toContain(value);
  });

  it('domain-separates the same value across security contexts', () => {
    const value = 'same-sensitive-input';
    const hashes = new Set([
      service.hash(value, 'refresh'),
      service.hash(value, 'otp'),
      service.hash(value, 'identifier'),
      service.hash(value, 'ip'),
      service.hash(value, 'device'),
      service.hash(value, 'mfa-challenge'),
    ]);

    expect(hashes.size).toBe(6);
  });

  it('returns current and previous lookup candidates during bounded rotation', () => {
    const candidates = service.candidateHashes('lookup-value', 'refresh');

    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toMatch(/^v8:/u);
    expect(candidates[1]).toMatch(/^v7:/u);
    expect(Object.isFrozen(candidates)).toBe(true);
  });

  it('verifies current and previous hashes with constant-size digests', () => {
    const value = 'lookup-value';
    const [current, previous] = service.candidateHashes(value, 'identifier');

    expect(service.verify(value, current, 'identifier')).toBe(true);
    expect(service.verify(value, previous, 'identifier')).toBe(true);
    expect(service.verify(`${value}-changed`, current, 'identifier')).toBe(false);
    expect(service.verify(value, current, 'ip')).toBe(false);
  });

  it.each([
    '',
    'v8:not-base64!',
    'v0:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    'v99:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  ])('rejects malformed or unavailable encoded hash %s', encoded => {
    expect(service.verify('value', encoded, 'refresh')).toBe(false);
  });

  it('rejects empty values at the hashing boundary', () => {
    expect(() => service.hash('', 'refresh')).toThrow(TypeError);
    expect(() => service.candidateHashes('', 'refresh')).toThrow(TypeError);
    expect(service.verify('', service.hash('value', 'refresh'), 'refresh')).toBe(false);
  });

  it('bounds attacker-controlled hash input', () => {
    const oversized = 'a'.repeat(4097);
    expect(() => service.hash(oversized, 'refresh')).toThrow(TypeError);
    expect(service.verify(oversized, service.hash('value', 'refresh'), 'refresh')).toBe(false);
  });
});
