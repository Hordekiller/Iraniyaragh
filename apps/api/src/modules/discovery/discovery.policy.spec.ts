import { describe, expect, it } from 'vitest';
import { escapeXml, isCanonicalSlug, parsePublicWebOrigin } from './discovery.policy';

describe('Public discovery URL boundary', () => {
  it('requires the configured HTTPS apex in production and never infers a host', () => {
    expect(parsePublicWebOrigin('https://iraniyaragh.com', 'production')).toBe('https://iraniyaragh.com');
    expect(parsePublicWebOrigin(undefined, 'test')).toBeUndefined();
    for (const value of [undefined, 'http://iraniyaragh.com', 'https://www.iraniyaragh.com', 'https://user:pass@iraniyaragh.com', 'https://iraniyaragh.com/path', 'https://iraniyaragh.com/', 'https://iraniyaragh.com?secret=x', 'https://localhost', 'https://example.test', 'https://iraniyaragh.com:8443']) {
      expect(() => parsePublicWebOrigin(value, 'production')).toThrow();
    }
  });
  it('retains existing valid product slugs up to the catalog limit and rejects path injection', () => {
    for (const slug of ['new', 'admin', 'hinge-123', 'یراق-کابینت', 'a'.repeat(250)]) expect(isCanonicalSlug(slug)).toBe(true);
    for (const slug of ['', '../admin', 'a/b', 'a%2fb', 'UPPER', '-hinge', 'hinge-', 'a'.repeat(251), '<script>', 'bad?x=1', 'bad#fragment']) expect(isCanonicalSlug(slug)).toBe(false);
  });
  it('escapes XML markup without changing URL identity', () => {
    expect(escapeXml('https://example.com/?a=1&b="<>\'')).toBe('https://example.com/?a=1&amp;b=&quot;&lt;&gt;&apos;');
  });
});
