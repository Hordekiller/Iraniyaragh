import { createSmsSettingsFixture, type SmsSettingsFixtureOptions } from './sms-settings-fixture';
import { SmsSettingsApiClient } from './sms-settings-api';
import type { SmsSettingsPort } from './sms-settings-port';

/**
 * Fail-closed SMS settings service selector for the admin panel (#115).
 *
 * Mirrors the `NEXT_PUBLIC_FIXTURE_AUTH` rule used for the pre-backend staff
 * fixture: the in-memory `SmsSettingsFixture` is only authorized as a dev/e2e
 * stand-in when `NEXT_PUBLIC_SMS_SETTINGS_FIXTURE=true` is baked into the build.
 * Any other value resolves to the real HTTP client (which itself requires the
 * API origin and a session token at call time). A production build therefore
 * can never serve the fixture.
 */
export function isSmsSettingsFixtureEnabled(): boolean {
  return process.env.NEXT_PUBLIC_SMS_SETTINGS_FIXTURE === 'true';
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
 * fixture builds, otherwise a live HTTP client bound to the caller's token.
 */
export function resolveSmsSettingsService(getToken: () => string | null): SmsSettingsPort {
  if (serviceOverride) return serviceOverride;
  if (isSmsSettingsFixtureEnabled()) {
    fixtureInstance ??= createSmsSettingsFixture();
    return fixtureInstance;
  }
  return new SmsSettingsApiClient(getToken);
}