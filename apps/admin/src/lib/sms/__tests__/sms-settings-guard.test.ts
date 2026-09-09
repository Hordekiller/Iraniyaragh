import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SmsSettingsFixtureNotEnabledError,
  assertSmsSettingsFixtureEnabled,
  isSmsSettingsFixtureEnabled,
  resolveSmsSettingsService,
  resetSmsSettingsFixtureForTests,
} from '../sms-settings-guard';
import { SmsSettingsApiClient } from '../sms-settings-api';

describe('sms-settings-guard', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    resetSmsSettingsFixtureForTests();
  });

  it('is fail-closed when NEXT_PUBLIC_SMS_SETTINGS_FIXTURE is absent', () => {
    delete process.env.NEXT_PUBLIC_SMS_SETTINGS_FIXTURE;
    vi.stubEnv('NODE_ENV', 'development');
    expect(isSmsSettingsFixtureEnabled()).toBe(false);
    expect(() => assertSmsSettingsFixtureEnabled()).toThrow(SmsSettingsFixtureNotEnabledError);
  });

  it('is fail-closed for every non-"true" value in development', () => {
    vi.stubEnv('NODE_ENV', 'development');
    for (const value of [undefined, '', 'TRUE', '1', 'yes', 'false']) {
      delete process.env.NEXT_PUBLIC_SMS_SETTINGS_FIXTURE;
      if (value !== undefined) process.env.NEXT_PUBLIC_SMS_SETTINGS_FIXTURE = value;
      expect(isSmsSettingsFixtureEnabled(), `value=${value}`).toBe(false);
    }
  });

  it('is enabled only for an explicit non-production opt-in', () => {
    vi.stubEnv('NODE_ENV', 'development');
    process.env.NEXT_PUBLIC_SMS_SETTINGS_FIXTURE = 'true';
    expect(isSmsSettingsFixtureEnabled()).toBe(true);
  });

  it('rejects the fixture opt-in in a production build regardless of the variable', () => {
    vi.stubEnv('NODE_ENV', 'production');
    process.env.NEXT_PUBLIC_SMS_SETTINGS_FIXTURE = 'true';
    expect(isSmsSettingsFixtureEnabled()).toBe(false);
    expect(() => assertSmsSettingsFixtureEnabled()).toThrow(SmsSettingsFixtureNotEnabledError);
  });

  it('resolves to the fixture only when the gate is satisfied, else to the HTTP client', () => {
    vi.stubEnv('NODE_ENV', 'development');
    process.env.NEXT_PUBLIC_SMS_SETTINGS_FIXTURE = 'true';
    const fixtureService = resolveSmsSettingsService(() => null);
    expect(fixtureService).toBeDefined();
    expect(fixtureService).not.toBeInstanceOf(SmsSettingsApiClient);

    vi.stubEnv('NODE_ENV', 'production');
    process.env.NEXT_PUBLIC_SMS_SETTINGS_FIXTURE = 'true';
    expect(() => resolveSmsSettingsService(() => null)).toThrow(SmsSettingsFixtureNotEnabledError);

    delete process.env.NEXT_PUBLIC_SMS_SETTINGS_FIXTURE;
    vi.stubEnv('NODE_ENV', 'development');
    const httpService = resolveSmsSettingsService(() => 'token');
    expect(httpService).toBeInstanceOf(SmsSettingsApiClient);
  });
});