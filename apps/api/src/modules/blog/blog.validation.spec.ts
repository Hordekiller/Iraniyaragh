import { describe, expect, it } from 'vitest';
import type { BlogPostInput } from '@iranyaragh/contracts';
import { demoteH1, normalizeTag, plainText, publishBlockers, readingMinutes, rewriteBlogImages, significantlyChanged, validateBlogInput } from './blog.validation';

const base = (over: Partial<BlogPostInput> = {}): BlogPostInput => ({
  slug: 'راهنمای-انتخاب-لولا', title: 'راهنمای انتخاب لولا', excerpt: 'در این راهنما یاد می‌گیرید لولای مناسب کابینت را چگونه انتخاب کنید.',
  bodyHtml: '<h2>مقدمه</h2><p>متن</p>', coverMediaId: null, coverAlt: null, tags: ['لولا'], seoTitle: null, seoDescription: null, sources: [], ...over,
});

describe('blog input validation', () => {
  it('accepts a Persian slug and normalises text, tags and sources', () => {
    const out = validateBlogInput(base({ title: '  عنوان  ', tags: [' لولا ', 'لولا', 'ریل  کشو'], sources: [{ title: 'منبع', url: 'https://example.com/a', accessedAt: '2026-11-01' }] }));
    expect(out.title).toBe('عنوان');
    expect(out.tags).toEqual(['لولا', 'ریل کشو']);
    expect(out.sources[0]!.url).toBe('https://example.com/a');
  });
  it.each(['', 'A-B', 'a b', '../x', 'feed.xml', 'a--b', '-a', 'a'.repeat(251)])('rejects slug %j', slug => expect(() => validateBlogInput(base({ slug }))).toThrow());
  it('rejects missing title/excerpt, long SEO fields and too many tags or sources', () => {
    expect(() => validateBlogInput(base({ title: ' ' }))).toThrow();
    expect(() => validateBlogInput(base({ excerpt: '' }))).toThrow();
    expect(() => validateBlogInput(base({ seoTitle: 'ا'.repeat(71) }))).toThrow();
    expect(() => validateBlogInput(base({ seoDescription: 'ا'.repeat(201) }))).toThrow();
    expect(() => validateBlogInput(base({ tags: Array.from({ length: 9 }, (_, i) => `t${i}`) }))).toThrow();
    expect(() => validateBlogInput(base({ sources: Array.from({ length: 11 }, () => ({ title: 'x', url: 'https://e.com', accessedAt: '2026-01-01' })) }))).toThrow();
  });
  it('requires https sources with a date and a cover alt when a cover is chosen', () => {
    for (const url of ['http://e.com', 'javascript:alert(1)', 'https://u:p@e.com', 'ftp://e.com']) expect(() => validateBlogInput(base({ sources: [{ title: 'x', url, accessedAt: '2026-01-01' }] }))).toThrow();
    expect(() => validateBlogInput(base({ sources: [{ title: 'x', url: 'https://e.com', accessedAt: 'yesterday' }] }))).toThrow();
    expect(() => validateBlogInput(base({ coverMediaId: 'm1', coverAlt: null }))).toThrow();
    expect(validateBlogInput(base({ coverMediaId: 'm1', coverAlt: ' تصویر ' })).coverAlt).toBe('تصویر');
    expect(validateBlogInput(base({ coverMediaId: null, coverAlt: 'ignored' })).coverAlt).toBeNull();
  });
  it('sanitizes hostile markup, never trusts an image src and demotes h1', () => {
    const out = validateBlogInput(base({ bodyHtml: '<h1>عنوان</h1><p onclick="x()">متن<script>alert(1)</script></p><img src="https://evil/x.png" data-media-id="m" onerror="x()"><a href="javascript:alert(1)">bad</a><iframe src="//e"></iframe>' }));
    expect(out.bodyHtml).not.toMatch(/<script|onclick|onerror|evil|javascript:|<iframe|<h1/iu);
    expect(out.bodyHtml).toContain('<h2>عنوان</h2>');
    expect(out.imageIds).toEqual(['m']);
  });
  it('limits an article to twenty images', () => {
    const imgs = Array.from({ length: 21 }, (_, i) => `<img data-media-id="m${i}" alt="x">`).join('');
    expect(() => validateBlogInput(base({ bodyHtml: imgs }))).toThrow(/20 images/u);
  });
  it('adds noopener to blank-target links', () => {
    expect(validateBlogInput(base({ bodyHtml: '<p><a href="https://e.com" target="_blank">x</a></p>' })).bodyHtml).toMatch(/rel="[^"]*noopener/u);
  });
});

describe('blog helpers', () => {
  it('extracts text, estimates reading time and demotes only h1', () => {
    expect(plainText('<style>p{}</style><p>الف <b>ب</b></p>')).toBe('الف ب');
    expect(readingMinutes('<p>' + 'کلمه '.repeat(450) + '</p>')).toBe(3);
    expect(readingMinutes('')).toBe(1);
    expect(demoteH1('<h1 id="a">x</h1><h2>y</h2>')).toBe('<h2 id="a">x</h2><h2>y</h2>');
  });
  it('normalises zero-width joiners and spaces in tags', () => { expect(normalizeTag('  ریل‌‌کشو  ')).toBe('ریل‌کشو'); });
  it('blocks thin articles from publishing and reports significant changes', () => {
    const thin = validateBlogInput(base());
    expect(publishBlockers(thin).length).toBeGreaterThan(0);
    const rich = { ...thin, bodyHtml: `<p>${'متن کامل مقاله '.repeat(40)}</p>` };
    expect(publishBlockers(rich)).toEqual([]);
    expect(significantlyChanged(thin, { ...thin })).toBe(false);
    expect(significantlyChanged(thin, { ...thin, title: 'دیگر' })).toBe(true);
  });
});

describe('blog body images', () => {
  const media = { id: 'm1', url: 'https://cdn.test/a.webp', width: 1200, height: 800, altText: 'متن رسانه' };
  it('builds dimensioned lazy images from the media row and prefers the editor alt', () => {
    const out = rewriteBlogImages('<p>x</p><img data-media-id="m1" alt="لولای نصب‌شده" src="https://evil/x.png">', [media]);
    expect(out).toBe('<p>x</p><img data-media-id="m1" src="https://cdn.test/a.webp" width="1200" height="800" alt="لولای نصب‌شده" loading="lazy" decoding="async">');
  });
  it('falls back to the media alt, and rejects missing alt or unavailable media', () => {
    expect(rewriteBlogImages('<img data-media-id="m1">', [media])).toContain('alt="متن رسانه"');
    expect(() => rewriteBlogImages('<img data-media-id="m1">', [{ ...media, altText: null }])).toThrow(/alt text/u);
    expect(() => rewriteBlogImages('<img data-media-id="gone" alt="x">', [media])).toThrow(/available/u);
  });
  it('escapes attribute values', () => {
    expect(rewriteBlogImages('<img data-media-id="m1" alt=\'a"b<c\'>', [media])).toContain('alt="a&quot;b&lt;c"');
  });
});
