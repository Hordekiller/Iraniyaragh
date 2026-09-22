import { describe, expect, it } from 'vitest';
import {
  CONTENT_HTML_LIMIT_UTF16,
  ContentTooLargeError,
  rewriteDescriptionImages,
  sanitizeDescriptionFragment,
} from './content-sanitizer';

describe('sanitizeDescriptionFragment', () => {
  it('returns null html for null, undefined and empty input', () => {
    expect(sanitizeDescriptionFragment(null)).toEqual({ html: null, imageIds: [] });
    expect(sanitizeDescriptionFragment(undefined)).toEqual({ html: null, imageIds: [] });
    expect(sanitizeDescriptionFragment('')).toEqual({ html: null, imageIds: [] });
  });

  it('strips script, event handlers, javascript: URLs and dangerous protocols', () => {
    const input = '<p onclick="alert(1)">hello</p><script>alert(1)</script><a href="javascript:alert(1)">x</a><iframe src="https://evil.example"></iframe>';
    const result = sanitizeDescriptionFragment(input);
    expect(result.html).toBe('<p>hello</p><a>x</a>');
    expect(result.imageIds).toEqual([]);
  });

  it('strips style tags, remaining event handlers and dangerous URL schemes', () => {
    const input =
      '<style>body{display:none}</style><p onload="alert(1)" onmouseover="steal()">x</p><a href="data:text/html,<script>alert(1)</script>">d</a><a href="vbscript:msgbox(1)">v</a>';
    const result = sanitizeDescriptionFragment(input);
    expect(result.html).toBe('<p>x</p><a>d</a><a>v</a>');
    expect(result.html).not.toMatch(/<style/i);
    expect(result.html).not.toMatch(/onload|onmouseover/i);
  });

  it('drops embed, object and video fallback elements', () => {
    const input =
      '<p>ok</p><embed src="https://evil.example/a.swf"><object data="https://evil.example/b"><param name="x"></object><video src="https://evil.example/c.mp4"></video>';
    const result = sanitizeDescriptionFragment(input);
    expect(result.html).toContain('<p>ok</p>');
    expect(result.html).not.toMatch(/embed|object|video|param|src=/i);
  });

  it('rejects dangerous style values (url, expression and image backgrounds)', () => {
    const input =
      '<span style="background-image:url(https://evil.example/x.png);color:expression(alert(1));width:100%">x</span>';
    const result = sanitizeDescriptionFragment(input);
    expect(result.html).toBe('<span>x</span>');
    expect(result.html).not.toMatch(/url\(|expression|background/i);
  });

  it('keeps allowed formatting elements and inline styles', () => {
    const input = '<h2 style="color:#ff0000;text-align:center">عنوان</h2><p><strong>bold</strong> <em>italic</em></p><ul><li>one</li></ul>';
    const result = sanitizeDescriptionFragment(input);
    expect(result.html).toContain('<h2 style="color:#ff0000;text-align:center">عنوان</h2>');
    expect(result.html).toContain('<strong>bold</strong>');
    expect(result.html).toContain('<em>italic</em>');
  });

  it('rejects non-allowed styles', () => {
    const input = '<span style="position:fixed;top:0;display:block">x</span>';
    const result = sanitizeDescriptionFragment(input);
    expect(result.html).toBe('<span>x</span>');
  });

  it('rewrites mailto links and adds rel noopener/noreferrer only for blank targets', () => {
    const input = '<a href="mailto:info@example.com">mail</a><a href="https://example.com" target="_blank">link</a>';
    const result = sanitizeDescriptionFragment(input);
    expect(result.html).toContain('<a href="mailto:info@example.com">mail</a>');
    expect(result.html).toContain('target="_blank" rel="noopener noreferrer"');
  });

  it('preserves shape-bearing data-media-id images and collects de-duplicated ids', () => {
    const result = sanitizeDescriptionFragment('<p><img data-media-id="f1c3m2" alt="one"><img data-media-id="f1c3m2" alt="again"><img data-media-id="mediaB7"></p>');
    expect(result.html).toBe('<p><img data-media-id="f1c3m2" alt="one" /><img data-media-id="f1c3m2" alt="again" /><img data-media-id="mediaB7" /></p>');
    expect(result.imageIds).toEqual(['f1c3m2', 'mediaB7']);
  });

  it('collects upload-style UUID media ids and lets the caller resolve them authoritatively', () => {
    const uuid = '7264490f-29a5-4b5a-a3ad-6c70d8d2853f';
    const result = sanitizeDescriptionFragment(`<p><img data-media-id="${uuid}"></p>`);
    expect(result.html).toBe(`<p><img data-media-id="${uuid}" /></p>`);
    expect(result.imageIds).toEqual([uuid]);
  });

  it('does not collect empty data-media-id values', () => {
    const result = sanitizeDescriptionFragment('<p><img data-media-id=""></p>');
    expect(result.imageIds).toEqual([]);
    expect(result.html).toBe('<p><img data-media-id /></p>');
  });

  it('drops src, width, height and event attributes from preserved images', () => {
    const input = '<img src="https://evil.example/x.png" width="999" height="1" onerror="alert(1)" data-media-id="f1c3m2" alt="ok" style="position:fixed">';
    const result = sanitizeDescriptionFragment(input, { images: 'preserve' });
    expect(result.html).toBe('<img data-media-id="f1c3m2" alt="ok" />');
  });

  it('removes images entirely when dropping is requested', () => {
    const input = '<p>keep <img data-media-id="f1c3m2" alt="x"> me</p>';
    const result = sanitizeDescriptionFragment(input, { images: 'drop' });
    expect(result.html).toBe('<p>keep  me</p>');
    expect(result.imageIds).toEqual([]);
  });

  it('throws ContentTooLargeError when the raw input exceeds the limit', () => {
    expect(() => sanitizeDescriptionFragment('a'.repeat(CONTENT_HTML_LIMIT_UTF16 + 1))).toThrow(ContentTooLargeError);
  });

  it('throws ContentTooLargeError when sanitized output exceeds the limit', () => {
    const withAncient = (value: string) => `\u0001a\u0002b\u0003${value}`;
    expect(() => sanitizeDescriptionFragment(withAncient('x'.repeat(CONTENT_HTML_LIMIT_UTF16)))).toThrow(ContentTooLargeError);
  });

  it('returns empty html when every node is disallowed', () => {
    expect(sanitizeDescriptionFragment('<script>alert(1)</script>').html).toBeNull();
  });
});

describe('rewriteDescriptionImages', () => {
  const images = [
    { id: 'f1c3m2', url: '/p/a/1.jpg', width: 1200, height: 800, alt: 'نخستین' },
    { id: 'mediaB7', url: '/p/a/2.jpg', width: 640, height: 480, alt: 'second "quoted"' },
  ];

  it('rewrites src, width, height from authoritative rows and escapes alt', () => {
    const html = '<p><img data-media-id="f1c3m2"><img data-media-id="mediaB7" alt="ignored client alt"></p>';
    const rewritten = rewriteDescriptionImages(html, images);
    expect(rewritten).toBe(
      '<p><img data-media-id="f1c3m2" src="/p/a/1.jpg" width="1200" height="800" alt="نخستین"><img data-media-id="mediaB7" src="/p/a/2.jpg" width="640" height="480" alt="second &quot;quoted&quot;"></p>',
    );
  });

  it('removes unresolved image nodes', () => {
    const html = '<p><img data-media-id="f1c3m2"><img data-media-id="missing1"></p>';
    expect(rewriteDescriptionImages(html, images)).toBe('<p><img data-media-id="f1c3m2" src="/p/a/1.jpg" width="1200" height="800" alt="نخستین"></p>');
  });

  it('returns html unchanged when it has no image tags', () => {
    expect(rewriteDescriptionImages('<p>plain</p>', images)).toBe('<p>plain</p>');
  });
});
