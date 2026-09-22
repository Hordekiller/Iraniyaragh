import { describe, expect, it } from 'vitest';
import { retryDelayMs } from './retry';

describe('retry backoff', () => {
  it('returns delay within the [cap/2, cap] bounds for every attempt', () => {
    for (const attempt of [1, 2, 3, 4, 5, 10]) {
      for (let i = 0; i < 100; i++) {
        const delay = retryDelayMs(attempt);
        const cap = Math.min(150, 25 * 2 ** (attempt - 1));
        const half = Math.floor(cap / 2);
        expect(delay).toBeGreaterThanOrEqual(half);
        expect(delay).toBeLessThanOrEqual(cap);
      }
    }
  });

  it('never exceeds the configured maximum delay', () => {
    for (const attempt of [1, 2, 3, 4, 5, 6, 7, 8]) {
      expect(retryDelayMs(attempt)).toBeLessThanOrEqual(150);
    }
  });

  it('never throws for an odd base cap (integer randomInt bound)', () => {
    for (const attempt of [1, 2, 3, 4, 5]) {
      expect(() => retryDelayMs(attempt)).not.toThrow();
    }
  });
});