export const RATE_LIMIT_KEY_VERSION = 1;

export const RATE_LIMITER_UNAVAILABLE = 'UPSTREAM_UNAVAILABLE';

export type RateLimitKind = 'otp-request' | 'otp-verify';

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
} as const);

export type RateLimitDefinition = Readonly<{ limit: number; windowSeconds: number }>;
