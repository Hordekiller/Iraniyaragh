import { MOBILE_PATTERN, OTP_CODE_PATTERN } from './types';

/**
 * Normalize an Iranian mobile number to canonical E.164 (`+989XXXXXXXXX`) for
 * sending to the API. Accepts documented Iranian input forms only long enough to
 * normalize them; persistence and hashing receive canonical E.164
 * (AUTH_CONTRACT §6.1).
 *
 * Accepted input forms:
 *   - international: `+989123456789`
 *   - leading national zero: `09123456789`, `989123456789`
 *   - with dashes/spaces between groups: `0912 345 6789`, `09-12-345-6789`
 *
 * Returns `null` when the input cannot be normalized unambiguously.
 */
export function normalizeIranianMobile(input: string): string | null {
  // Iranian keypads frequently produce Persian/Arabic-Indic digits; transliterate
  // them to ASCII before stripping separators so validation is unambiguous.
  const ascii = input.replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  const digits = ascii.replace(/[\s\-()]/g, '');

  let candidate: string;
  if (digits.startsWith('+98')) {
    candidate = digits.slice(1); // +989...
  } else if (digits.startsWith('0098')) {
    candidate = `98${digits.slice(4)}`;
  } else if (digits.startsWith('98') && digits.length > 10) {
    candidate = digits; // 989...
  } else if (digits.startsWith('0') && digits.length === 11) {
    candidate = `98${digits.slice(1)}`; // 09... -> 989...
  } else if (digits.length === 10 && digits.startsWith('9')) {
    candidate = `98${digits}`; // 9123456789 -> 989123456789
  } else {
    return null;
  }

  const normalized = `+${candidate}`;
  return MOBILE_PATTERN.test(normalized) ? normalized : null;
}

/**
 * Validate an OTP code. Codes are exactly six ASCII digits; anything else is
 * rejected before it is sent to the API (AUTH_CONTRACT §6.2).
 */
export function isValidOtpCode(code: string): boolean {
  return OTP_CODE_PATTERN.test(code);
}

/** True only when the six-digit code is incomplete but otherwise valid. */
export function isPartialOtpCode(code: string): boolean {
  return /^[0-9]{0,5}$/.test(code);
}
