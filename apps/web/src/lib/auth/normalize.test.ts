import { describe, expect, it } from 'vitest';
import {
  isPartialOtpCode,
  isValidOtpCode,
  normalizeIranianMobile,
} from './normalize';

describe('normalizeIranianMobile', () => {
  it.each([
    ['+989123456789', '+989123456789', 'international'],
    ['09123456789', '+989123456789', 'national leading zero'],
    ['989123456789', '+989123456789', 'national without plus'],
    ['0912 345 6789', '+989123456789', 'with spaces'],
    ['0912-345-6789', '+989123456789', 'with dashes'],
    ['9123456789', '+989123456789', 'without leading zero'],
  ])('normalizes %s (%s) -> %s', (input, expected) => {
    expect(normalizeIranianMobile(input)).toBe(expected);
  });

  it('accepts a 0098 international prefix', () => {
    expect(normalizeIranianMobile('00989123456789')).toBe('+989123456789');
  });

  it.each(['', '123', '0912', 'not-a-number', '+98912', '0991234567'])(
    'rejects invalid input %j',
    (input) => {
      expect(normalizeIranianMobile(input)).toBeNull();
    },
  );

  it('does not mutate unnormalized-but-valid international form', () => {
    expect(normalizeIranianMobile('+989123456789')).toBe('+989123456789');
  });
});

describe('isValidOtpCode', () => {
  it('accepts exactly six digits', () => {
    expect(isValidOtpCode('123456')).toBe(true);
  });

  it.each(['12345', '1234567', '12345a', 'abcdef', '', ' 123456'])(
    'rejects %j',
    (code) => {
      expect(isValidOtpCode(code)).toBe(false);
    },
  );
});

describe('isPartialOtpCode', () => {
  it.each(['', '1', '12345'])('accepts incomplete %j', (code) => {
    expect(isPartialOtpCode(code)).toBe(true);
  });

  it.each(['123456', '1234567', 'abc', '1a'])('rejects %j', (code) => {
    expect(isPartialOtpCode(code)).toBe(false);
  });
});
