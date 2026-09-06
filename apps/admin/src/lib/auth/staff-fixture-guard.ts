/**
 * Fail-closed fixture-auth guard for the admin panel (#50).
 *
 * Mirrors the storefront's `VITE_FIXTURE_AUTH` rule (apps/web AuthProvider):
 * the pre-backend `StaffAuthFixtureClient` is only authorized as a dev/e2e
 * stand-in when `NEXT_PUBLIC_FIXTURE_AUTH=true` is baked into the build. Any
 * other value (or an absent variable) must fail closed so a shipped build can
 * never demo-auth staff. This guard also asserts that the surrounding module is
 * only ever imported from a fixture-gated entry point, never from prod paths.
 */

export class FixtureAuthNotEnabledError extends Error {
  constructor() {
    super(
      'The staff fixture auth client is not enabled in this build. Wire the real ' +
        'staff Auth API (docs/AUTH_CONTRACT.md, #49/#74) or build with ' +
        'NEXT_PUBLIC_FIXTURE_AUTH=true for local dev / e2e only.',
    );
    this.name = 'FixtureAuthNotEnabledError';
  }
}

/**
 * Returns `true` in builds explicitly compiled with the fixture opt-in. Callers
 * must treat a `false` here as fatal whenever a fixture client would otherwise
 * be constructed; `assertFixtureAuthEnabled` is the fail-closed entry point.
 *
 * The value is read lazily at call time so production/CI (absent var) and tests
 * (explicit opt-in) behave predictably without module-scope capture.
 */
export function isFixtureAuthEnabled(): boolean {
  return process.env.NEXT_PUBLIC_FIXTURE_AUTH === 'true';
}

/**
 * Throws unless the current build explicitly authorizes the fixture client.
 * Production/CI builds without the opt-in never silently fall back to the
 * fixture; they fail at request time instead.
 */
export function assertFixtureAuthEnabled(): void {
  if (!isFixtureAuthEnabled()) {
    throw new FixtureAuthNotEnabledError();
  }
}