import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import {
  buildMediaImageHtml,
  createMediaPickerHandle,
  useMediaPicker,
} from './media-picker';
import type { MediaPickerAdapter, MediaPickerHandle, MediaPickerItem } from './media-picker';

const item: MediaPickerItem = {
  id: 'media-1',
  url: '/cdn/media-1.webp',
  alt: 'قفل دستگیره‌ای "فوق‌راحت" & ایمن',
  caption: null,
  width: 1200,
  height: 900,
};

describe('createMediaPickerHandle', () => {
  it('binds a product id to an adapter', () => {
    const open = vi.fn();
    const handle = createMediaPickerHandle('product-9', open);
    expect(handle.productId).toBe('product-9');
    expect(handle.open).toBe(open);
  });
});

describe('useMediaPicker', () => {
  it('returns undefined while product id or adapter is missing', () => {
    const open = vi.fn();
    const { result, rerender } = renderHook<
      MediaPickerHandle | undefined,
      { productId?: string; adapter?: MediaPickerAdapter }
    >(({ productId, adapter }) => useMediaPicker(productId, adapter), {
      initialProps: { productId: undefined, adapter: open },
    });
    expect(result.current).toBeUndefined();
    rerender({ productId: 'p1', adapter: undefined });
    expect(result.current).toBeUndefined();
    rerender({ productId: 'p1', adapter: open });
    expect(result.current).toEqual({ productId: 'p1', open });
  });

  it('creates a stable handle for the given product id and adapter', () => {
    const open = vi.fn();
    const { result, rerender } = renderHook(
      ({ productId, adapter }: { productId: string; adapter: typeof open }) =>
        useMediaPicker(productId, adapter),
      { initialProps: { productId: 'p1', adapter: open } },
    );
    expect(result.current).toEqual({ productId: 'p1', open });
    const first = result.current;
    rerender({ productId: 'p1', adapter: open });
    expect(result.current).toBe(first);
  });
});

describe('buildMediaImageHtml', () => {
  it('emits a controlled image with data-media-id and preview attributes', () => {
    const html = buildMediaImageHtml({ ...item, alt: 'logo' });
    expect(html).toContain('data-media-id="media-1"');
    expect(html).toContain('src="/cdn/media-1.webp"');
    expect(html).toContain('width="1200"');
    expect(html).toContain('height="900"');
  });

  it('escapes attribute-breaking characters in id, url and alt text', () => {
    const nasty: MediaPickerItem = {
      id: 'a"b',
      url: '/cdn/x?a=1&b=2',
      alt: '<b>alt</b>',
      caption: null,
      width: 100,
      height: 100,
    };
    const html = buildMediaImageHtml(nasty);
    expect(html).toContain('data-media-id="a&quot;b"');
    expect(html).toContain('src="/cdn/x?a=1&amp;b=2"');
    expect(html).toContain('alt="&lt;b&gt;alt&lt;/b&gt;"');
  });

  it('adds the picker caption as an escaped title attribute, or omits it', () => {
    const withCaption: MediaPickerItem = {
      id: 'm1',
      url: '/cdn/m1.webp',
      alt: 'alt',
      caption: 'عکس & «فروش» <i>ویژه</i>',
      width: 100,
      height: 100,
    };
    const html = buildMediaImageHtml(withCaption);
    expect(html).toContain('title="عکس &amp; «فروش» &lt;i&gt;ویژه&lt;/i&gt;"');

    const withoutCaption = buildMediaImageHtml({ ...withCaption, caption: null });
    expect(withoutCaption).not.toContain('title=');
  });
});