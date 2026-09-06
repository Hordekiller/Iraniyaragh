import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FixtureAuthNotEnabledError,
  assertFixtureAuthEnabled,
  isFixtureAuthEnabled,
} from '../staff-fixture-guard';

describe('staff-fixture-guard', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('is fail-closed when NEXT_PUBLIC_FIXTURE_AUTH is absent', () => {
    delete process.env.NEXT_PUBLIC_FIXTURE_AUTH;
    expect(isFixtureAuthEnabled()).toBe(false);
    expect(() => assertFixtureAuthEnabled()).toThrow(FixtureAuthNotEnabledError);
  });

  it('is fail-closed for any value other than the literal "true"', () => {
    for (const value of ['false', '1', 'TRUE', 'yes', '0']) {
      process.env.NEXT_PUBLIC_FIXTURE_AUTH = value;
      expect(isFixtureAuthEnabled(), `value=${value}`).toBe(false);
    }
  });

  it('enables the fixture only for the exact value "true"', () => {
    process.env.NEXT_PUBLIC_FIXTURE_AUTH = 'true';
    expect(isFixtureAuthEnabled()).toBe(true);
    expect(() => assertFixtureAuthEnabled()).not.toThrow();
  });
});
