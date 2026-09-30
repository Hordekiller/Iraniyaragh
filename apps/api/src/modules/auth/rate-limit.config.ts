export const RATE_LIMIT_KEY_VERSION = 1;

export const RATE_LIMITER_UNAVAILABLE = 'UPSTREAM_UNAVAILABLE';

export type RateLimitKind =
  | 'otp-request'
  | 'otp-verify'
  | 'refresh'
  | 'guest-cart';

/**
 * Fixed-window limits from AUTH_CONTRACT §9. Every key is versioned and, for
 * identifiers/IPs, the caller must pass a keyed hash (via AuthHashService).
 */
export const RATE_LIMIT_DEFINITIONS = Object.freeze({
  /** Customer SMS request — per canonical destination. */
  'otp-request:destination': Object.freeze({ limit: 1, windowSeconds: 60 }),
  /** Customer SMS request — per canonical destination, 15-minute window. */
  'otp-request:destination-15m': Object.freeze({ limit: 3, windowSeconds: 900 }),
  /** Customer SMS request — per canonical destination, 24-hour window. */
  'otp-request:destination-24h': Object.freeze({ limit: 10, windowSeconds: 86_400 }),
  /** Customer SMS request — per safe IP hash. */
  'otp-request:ip-hour': Object.freeze({ limit: 20, windowSeconds: 3_600 }),
  /** Customer SMS request — per safe IP hash, 24-hour window. */
  'otp-request:ip-24h': Object.freeze({ limit: 100, windowSeconds: 86_400 }),
  /** Customer OTP verification — failed attempts per safe IP hash. */
  'otp-verify:ip-fail-hour': Object.freeze({ limit: 50, windowSeconds: 3_600 }),
  /** Staff password failures per canonical identifier. */
  'staff-password:identifier': Object.freeze({ limit: 5, windowSeconds: 900 }),
  /** Staff password failures per safe IP hash. */
  'staff-password:ip': Object.freeze({ limit: 30, windowSeconds: 900 }),
  /** Staff MFA challenge failures per safe IP hash. */
  'staff-mfa:ip': Object.freeze({ limit: 5, windowSeconds: 300 }),
  /** Token refresh attempts per safe IP hash (AUTH_CONTRACT §9). */
  'refresh:ip': Object.freeze({ limit: 30, windowSeconds: 60 }),
  /** Anonymous Cart mutations per trusted proxy-derived IP. */
  'guest-cart:ip-minute': Object.freeze({ limit: 60, windowSeconds: 60 }),
  /** Anonymous Cart mutations per IP over a wider abuse-control window. */
  'guest-cart:ip-hour': Object.freeze({
    limit: 120,
    windowSeconds: 3_600,
  }),
  /** Guest-session issuance per trusted proxy-derived IP. */
  'guest-cart:bootstrap-ip-hour': Object.freeze({
    limit: 120,
    windowSeconds: 3_600,
  }),
} as const);

export type RateLimitDefinition = Readonly<{ limit: number; windowSeconds: number }>;

export type RateLimitDimension = keyof typeof RATE_LIMIT_DEFINITIONS;

/**
 * Test-environment budget for the staff sign-in buckets only.
 *
 * The automated suite signs the *same* staff identity in from the *same* IP once
 * per test, and each desktop/mobile project repeats it, so a run legitimately
 * performs far more successful sign-ins than the anti-credential-stuffing
 * thresholds above allow. Raising the ceiling here keeps AUTH_CONTRACT §9 intact
 * for every real environment while letting the suite exercise the real login
 * instead of a bypass. No other dimension is relaxed: customer OTP, guest cart
 * and refresh abuse limits stay exactly as configured.
 */
const TEST_ONLY_STAFF_SIGN_IN_LIMITS = Object.freeze({
  'staff-password:identifier': Object.freeze({ limit: 200, windowSeconds: 900 }),
  'staff-password:ip': Object.freeze({ limit: 200, windowSeconds: 900 }),
  'staff-mfa:ip': Object.freeze({ limit: 200, windowSeconds: 300 }),
} as const satisfies Partial<Record<RateLimitDimension, RateLimitDefinition>>);



/** Production values, always. */
export const STAFF_SIGN_IN_RATE_LIMITS = Object.freeze({
  'staff-password:identifier': RATE_LIMIT_DEFINITIONS['staff-password:identifier'],
  'staff-password:ip': RATE_LIMIT_DEFINITIONS['staff-password:ip'],
  'staff-mfa:ip': RATE_LIMIT_DEFINITIONS['staff-mfa:ip'],
} as const);

export function rateLimitDefinitionFor(
  dimension: RateLimitDimension,
  environment: string,
): RateLimitDefinition {
  if (environment === 'test' && dimension in TEST_ONLY_STAFF_SIGN_IN_LIMITS) {
    return TEST_ONLY_STAFF_SIGN_IN_LIMITS[
      dimension as keyof typeof TEST_ONLY_STAFF_SIGN_IN_LIMITS
    ];
  }
  return RATE_LIMIT_DEFINITIONS[dimension];
}
