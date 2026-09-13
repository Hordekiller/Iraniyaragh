import { describe, expect, it } from 'vitest';
import { randomUuid } from './random-uuid';

describe('randomUuid', () => {
  it('returns a UUID v4-shaped string', () => {
    expect(randomUuid()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('produces distinct ids in bulk', () => {
    const ids = new Set(Array.from({ length: 1_000 }, () => randomUuid()));
    expect(ids.size).toBe(1_000);
  });
});