import { describe, expect, it } from 'vitest';

import {
  RATE_LIMIT_DEFINITIONS,
  STAFF_SIGN_IN_RATE_LIMITS,
  rateLimitDefinitionFor,
} from './rate-limit.config';

describe('rateLimitDefinitionFor', () => {
  it('keeps the AUTH_CONTRACT staff sign-in thresholds in every non-test environment', () => {
    for (const environment of ['development', 'staging', 'production']) {
      expect(rateLimitDefinitionFor('staff-password:identifier', environment)).toEqual(
        STAFF_SIGN_IN_RATE_LIMITS['staff-password:identifier'],
      );
      expect(rateLimitDefinitionFor('staff-password:ip', environment)).toEqual(
        STAFF_SIGN_IN_RATE_LIMITS['staff-password:ip'],
      );
      expect(rateLimitDefinitionFor('staff-mfa:ip', environment)).toEqual(
        STAFF_SIGN_IN_RATE_LIMITS['staff-mfa:ip'],
      );
    }
  });

  it('pins the production staff sign-in thresholds', () => {
    expect(STAFF_SIGN_IN_RATE_LIMITS).toEqual({
      'staff-password:identifier': { limit: 5, windowSeconds: 900 },
      'staff-password:ip': { limit: 30, windowSeconds: 900 },
      'staff-mfa:ip': { limit: 5, windowSeconds: 300 },
    });
  });

  it('raises only the staff sign-in budget under test so the real sign-in can be exercised', () => {
    expect(rateLimitDefinitionFor('staff-password:identifier', 'test').limit).toBeGreaterThan(
      STAFF_SIGN_IN_RATE_LIMITS['staff-password:identifier'].limit,
    );
    expect(rateLimitDefinitionFor('staff-mfa:ip', 'test').limit).toBeGreaterThan(
      STAFF_SIGN_IN_RATE_LIMITS['staff-mfa:ip'].limit,
    );
  });

  it('never relaxes customer OTP, guest cart or refresh limits under test', () => {
    for (const dimension of [
      'otp-request:destination',
      'otp-request:destination-15m',
      'otp-request:destination-24h',
      'otp-request:ip-hour',
      'otp-request:ip-24h',
      'otp-verify:ip-fail-hour',
      'refresh:ip',
      'guest-cart:ip-minute',
      'guest-cart:ip-hour',
      'guest-cart:bootstrap-ip-hour',
    ] as const) {
      expect(rateLimitDefinitionFor(dimension, 'test')).toEqual(RATE_LIMIT_DEFINITIONS[dimension]);
    }
  });

  it('keeps the window length identical when the test budget is raised', () => {
    for (const dimension of ['staff-password:identifier', 'staff-password:ip', 'staff-mfa:ip'] as const) {
      expect(rateLimitDefinitionFor(dimension, 'test').windowSeconds).toBe(
        RATE_LIMIT_DEFINITIONS[dimension].windowSeconds,
      );
    }
  });
});
