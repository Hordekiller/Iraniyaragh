import { describe, expect, it } from 'vitest';
import { normalizeIranianMobile } from './mobile';

describe('normalizeIranianMobile', () => {
  it('normalizes the leading-zero Iranian form', () => {
    expect(normalizeIranianMobile('09123456789')?.value).toBe('+989123456789');
  });

  it('normalizes the +98 form', () => {
    expect(normalizeIranianMobile('+989123456789')?.value).toBe('+989123456789');
  });

  it('normalizes the bare 98 form', () => {
    expect(normalizeIranianMobile('989123456789')?.value).toBe('+989123456789');
  });

  it('strips interleaved spaces and dashes', () => {
    expect(normalizeIranianMobile('+98 912 345 6789')?.value).toBe('+989123456789');
    expect(normalizeIranianMobile('0912-345-6789')?.value).toBe('+989123456789');
  });

  it('rejects non-Iranian mobile shapes', () => {
    expect(normalizeIranianMobile('04123456789')).toBeNull();
    expect(normalizeIranianMobile('1234567890')).toBeNull();
    expect(normalizeIranianMobile('+4409123456789')).toBeNull();
    expect(normalizeIranianMobile('')).toBeNull();
  });

  it('rejects non-string and malformed input', () => {
    expect(normalizeIranianMobile(undefined)).toBeNull();
    expect(normalizeIranianMobile('not-a-number')).toBeNull();
    expect(normalizeIranianMobile('0912345678')).toBeNull(); // too short
    expect(normalizeIranianMobile('091234567890')).toBeNull(); // too long
  });

  it('returns a frozen object', () => {
    const result = normalizeIranianMobile('09123456789');
    expect(result).not.toBeNull();
    expect(Object.isFrozen(result)).toBe(true);
  });
});