import { createSmsSettingsFixture, type SmsSettingsFixtureOptions } from './sms-settings-fixture';
import { SmsSettingsApiClient } from './sms-settings-api';
import type { SmsSettingsPort } from './sms-settings-port';

/**
 * Fail-closed SMS settings service selector for the admin panel (#115).
 *
 * Mirrors the `NEXT_PUBLIC_FIXTURE_AUTH` rule used for the pre-backend staff
 * fixture: the in-memory `SmsSettingsFixture` is only authorized as a dev/e2e
 * stand-in when `NEXT_PUBLIC_SMS_SETTINGS_FIXTURE=true` is baked into the build
 * AND the build is not production. A production build/runtime with the variable
 * set is rejected by the fixture gate, exactly like the auth fixture guard, so
 * a shipped build can never serve the volatile fixture. Any other resolution
 * falls through to the real HTTP client (which itself requires the API origin
 * and a session token at call time).
 */
export class SmsSettingsFixtureNotEnabledError extends Error {
  constructor() {
    super(
      'The SMS settings fixture is not enabled in this build. Wire the real ' +
        'notifications admin API (docs/API_STANDARDS.md, #114/#118) or build with ' +
        'NEXT_PUBLIC_SMS_SETTINGS_FIXTURE=true for local dev / e2e only.',
    );
    this.name = 'SmsSettingsFixtureNotEnabledError';
  }
}

/**
 * Returns `true` only for an explicit non-production fixture opt-in. Any other
 * combination (absent, `false`, or a production build) fails closed so a
 * shipped build can never serve the fixture.
 */
export function isSmsSettingsFixtureEnabled(): boolean {
  if (process.env.NODE_ENV === 'production') return false;
  return process.env.NEXT_PUBLIC_SMS_SETTINGS_FIXTURE === 'true';
}

/** Throws unless the current build explicitly authorizes the fixture service. */
export function assertSmsSettingsFixtureEnabled(): void {
  if (!isSmsSettingsFixtureEnabled()) {
    throw new SmsSettingsFixtureNotEnabledError();
  }
}

let fixtureInstance: SmsSettingsPort | null = null;
let serviceOverride: SmsSettingsPort | null = null;

export function subscribeSmsSettingsFixtureForTests(options: SmsSettingsFixtureOptions = {}): void {
  fixtureInstance = createSmsSettingsFixture(options);
}

export function resetSmsSettingsFixtureForTests(): void {
  fixtureInstance = null;
  serviceOverride = null;
}

/** Test-only escape hatch to inject a failing/stubbed service for error-state coverage. */
export function setSmsSettingsServiceOverrideForTests(service: SmsSettingsPort | null): void {
  serviceOverride = service;
}

/**
 * Returns the service implementation for the page: the deterministic fixture in
 * explicitly authorized non-production builds, otherwise a live HTTP client
 * bound to the caller's token.
 */
export function resolveSmsSettingsService(getToken: () => string | null): SmsSettingsPort {
  if (serviceOverride) return serviceOverride;
  if (process.env.NEXT_PUBLIC_SMS_SETTINGS_FIXTURE === 'true') {
    assertSmsSettingsFixtureEnabled();
    fixtureInstance ??= createSmsSettingsFixture();
    return fixtureInstance;
  }
  return new SmsSettingsApiClient(getToken);
}