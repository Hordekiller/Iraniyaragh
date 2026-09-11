import { afterEach, describe, expect, it, vi } from 'vitest';
import { SessionManagementApiClient } from '../session-api';
import {
  SessionFixtureNotEnabledError,
  assertSessionFixtureEnabled,
  isSessionFixtureEnabled,
  resetSessionFixtureForTests,
  resolveSessionManagementService,
} from '../session-guard';

describe('session-guard', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    resetSessionFixtureForTests();
  });

  it('is fail-closed when NEXT_PUBLIC_SESSION_FIXTURE is absent', () => {
    delete process.env.NEXT_PUBLIC_SESSION_FIXTURE;
    vi.stubEnv('NODE_ENV', 'development');
    expect(isSessionFixtureEnabled()).toBe(false);
    expect(() => assertSessionFixtureEnabled()).toThrow(SessionFixtureNotEnabledError);
  });

  it('is fail-closed for every non-"true" value in development', () => {
    vi.stubEnv('NODE_ENV', 'development');
    for (const value of [undefined, '', 'TRUE', '1', 'yes', 'false']) {
      delete process.env.NEXT_PUBLIC_SESSION_FIXTURE;
      if (value !== undefined) process.env.NEXT_PUBLIC_SESSION_FIXTURE = value;
      expect(isSessionFixtureEnabled(), `value=${value}`).toBe(false);
    }
  });

  it('is enabled only for an explicit non-production opt-in', () => {
    vi.stubEnv('NODE_ENV', 'development');
    process.env.NEXT_PUBLIC_SESSION_FIXTURE = 'true';
    expect(isSessionFixtureEnabled()).toBe(true);
  });

  it('rejects the fixture opt-in in a production build regardless of the variable', () => {
    vi.stubEnv('NODE_ENV', 'production');
    process.env.NEXT_PUBLIC_SESSION_FIXTURE = 'true';
    expect(isSessionFixtureEnabled()).toBe(false);
    expect(() => assertSessionFixtureEnabled()).toThrow(SessionFixtureNotEnabledError);
  });

  it('resolves to the fixture only when the gate is satisfied, else to the HTTP client', () => {
    vi.stubEnv('NODE_ENV', 'development');
    process.env.NEXT_PUBLIC_SESSION_FIXTURE = 'true';
    const fixtureService = resolveSessionManagementService(() => null);
    expect(fixtureService).toBeDefined();
    expect(fixtureService).not.toBeInstanceOf(SessionManagementApiClient);

    vi.stubEnv('NODE_ENV', 'production');
    process.env.NEXT_PUBLIC_SESSION_FIXTURE = 'true';
    expect(() => resolveSessionManagementService(() => null)).toThrow(SessionFixtureNotEnabledError);

    delete process.env.NEXT_PUBLIC_SESSION_FIXTURE;
    vi.stubEnv('NODE_ENV', 'development');
    const httpService = resolveSessionManagementService(() => 'token');
    expect(httpService).toBeInstanceOf(SessionManagementApiClient);
  });
});