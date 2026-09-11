import { SessionManagementApiClient } from './session-api';
import { SessionManagementFixture, type SessionFixtureOptions } from './session-fixture';
import type { SessionManagementPort } from './session-port';

/**
 * Fail-closed session-management service selector for the admin panel (#50).
 *
 * Mirrors the `NEXT_PUBLIC_SMS_SETTINGS_FIXTURE` rule used for the SMS panel:
 * the in-memory `SessionManagementFixture` is only authorized as a dev/e2e
 * stand-in when `NEXT_PUBLIC_SESSION_FIXTURE=true` is baked into the build AND
 * the build is not production. A production build/runtime with the variable set
 * is rejected by the fixture gate — a shipped build can never serve the
 * volatile fixture. Any other resolution falls through to the real HTTP client
 * (which itself requires the API origin and a session token at call time).
 */
export class SessionFixtureNotEnabledError extends Error {
  constructor() {
    super(
      'The session-management fixture is not enabled in this build. Wire the real ' +
        '/auth/sessions API (docs/AUTH_CONTRACT.md, #50) or build with ' +
        'NEXT_PUBLIC_SESSION_FIXTURE=true for local dev / e2e only.',
    );
    this.name = 'SessionFixtureNotEnabledError';
  }
}

/**
 * Returns `true` only for an explicit non-production fixture opt-in. Any other
 * combination (absent, `false`, or a production build) fails closed so a
 * shipped build can never serve the fixture.
 */
export function isSessionFixtureEnabled(): boolean {
  if (process.env.NODE_ENV === 'production') return false;
  return process.env.NEXT_PUBLIC_SESSION_FIXTURE === 'true';
}

/** Throws unless the current build explicitly authorizes the fixture service. */
export function assertSessionFixtureEnabled(): void {
  if (!isSessionFixtureEnabled()) {
    throw new SessionFixtureNotEnabledError();
  }
}

let fixtureInstance: SessionManagementPort | null = null;
let serviceOverride: SessionManagementPort | null = null;

export function subscribeSessionFixtureForTests(options: SessionFixtureOptions = {}): void {
  fixtureInstance = SessionManagementFixture.create(options);
}

export function resetSessionFixtureForTests(): void {
  fixtureInstance = null;
  serviceOverride = null;
}

/** Test-only escape hatch to inject a failing/stubbed service for error-state coverage. */
export function setSessionServiceOverrideForTests(service: SessionManagementPort | null): void {
  serviceOverride = service;
}

/**
 * Returns the service implementation for the page: the deterministic fixture in
 * explicitly authorized non-production builds, otherwise a live HTTP client
 * bound to the caller's token.
 */
export function resolveSessionManagementService(getToken: () => string | null): SessionManagementPort {
  if (serviceOverride) return serviceOverride;
  if (process.env.NEXT_PUBLIC_SESSION_FIXTURE === 'true') {
    assertSessionFixtureEnabled();
    fixtureInstance ??= SessionManagementFixture.create();
    return fixtureInstance;
  }
  return new SessionManagementApiClient(getToken);
}