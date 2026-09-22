import { describe, expect, it } from 'vitest';
import { serializeJsonLd } from './json-ld';

describe('serializeJsonLd', () => {
  it('serializes plain structured data as valid JSON', () => {
    const data = { '@context': 'https://schema.org', name: 'مته' };
    expect(JSON.parse(serializeJsonLd(data))).toEqual(data);
  });

  it('escapes characters that could terminate a script element', () => {
    const data = {
      description: '</script><script>window.pwned = true</script>',
    };
    const output = serializeJsonLd(data);
    expect(output).not.toContain('</script>');
    expect(output).toContain('\\u003c/script\\u003e');
    expect(output).not.toContain('&');
    expect(JSON.parse(output)).toEqual(data);
  });

  it('escapes every angle bracket and ampersand occurrence', () => {
    const data = { text: '<a href="x?y=1&z=2">' };
    const output = serializeJsonLd(data);
    expect(output).not.toMatch(/[<>&]/);
    expect(JSON.parse(output)).toEqual(data);
  });
});