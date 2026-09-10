import { describe, expect, it } from 'vitest';
import { DEVELOPMENT_CSRF_COOKIE, PRODUCTION_CSRF_COOKIE, readCsrfCookie } from './csrf';

function fakeDocument(cookieString: string): Document {
  return { cookie: cookieString } as unknown as Document;
}

describe('readCsrfCookie', () => {
  it('returns null when no cookies are present', () => {
    expect(readCsrfCookie(fakeDocument(''))).toBeNull();
  });

  it('extracts the production csrf cookie value when present', () => {
    const value = 'abc-123';
    const doc = fakeDocument(`${PRODUCTION_CSRF_COOKIE}=${value}; foo=bar`);
    expect(readCsrfCookie(doc)).toBe(value);
  });

  it('falls back to the development csrf cookie when production is absent', () => {
    const value = 'dev-csrf';
    const doc = fakeDocument(`some=thing; ${DEVELOPMENT_CSRF_COOKIE}=${value}`);
    expect(readCsrfCookie(doc)).toBe(value);
  });

  it('returns null when only other cookies are present', () => {
    const doc = fakeDocument('foo=bar; baz=1');
    expect(readCsrfCookie(doc)).toBeNull();
  });

  it('returns null for an empty cookie value', () => {
    const doc = fakeDocument(`${PRODUCTION_CSRF_COOKIE}=`);
    expect(readCsrfCookie(doc)).toBeNull();
  });

  it('prefers the production name when both exist', () => {
    const doc = fakeDocument(
      `${DEVELOPMENT_CSRF_COOKIE}=dev; ${PRODUCTION_CSRF_COOKIE}=prod`
    );
    expect(readCsrfCookie(doc)).toBe('prod');
  });
});