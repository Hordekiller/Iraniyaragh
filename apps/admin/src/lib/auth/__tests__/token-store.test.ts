import { describe, expect, it } from 'vitest';
import { getAccessToken, setAccessToken } from '../token-store';

describe('token-store (memory only)', () => {
  it('starts with no token', () => {
    expect(getAccessToken()).toBeNull();
  });

  it('stores and returns a token in memory', () => {
    setAccessToken('at-123');
    expect(getAccessToken()).toBe('at-123');
  });

  it('clears the token when set to null', () => {
    setAccessToken('at-123');
    setAccessToken(null);
    expect(getAccessToken()).toBeNull();
  });
});
