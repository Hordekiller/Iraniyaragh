import { describe, expect, it } from 'vitest';
import { buildMediaImageHtml } from './media-picker';

const item = { id: 'm1', url: 'https://cdn.test/a.webp', alt: 'لولا "نصب"', caption: 'عنوان <b>', width: 1200, height: 800 };

describe('buildMediaImageHtml', () => {
  it('keeps the product description markup unchanged by default', () => {
    expect(buildMediaImageHtml(item)).toBe('<img data-media-id="m1" src="https://cdn.test/a.webp" alt="لولا &quot;نصب&quot;" title="عنوان &lt;b&gt;" width="1200" height="800" />');
  });
  it('builds an article figure with an escaped real figcaption', () => {
    expect(buildMediaImageHtml(item, { figure: true })).toBe('<figure><img data-media-id="m1" src="https://cdn.test/a.webp" alt="لولا &quot;نصب&quot;" width="1200" height="800" /><figcaption>عنوان &lt;b&gt;</figcaption></figure>');
    expect(buildMediaImageHtml({ ...item, caption: null }, { figure: true })).not.toContain('figcaption');
  });
});
