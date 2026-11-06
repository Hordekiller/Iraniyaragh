import { useMemo } from 'react';
import type { AdminProductMediaPickerItem } from '@iranyaragh/contracts';

export type MediaPickerItem = AdminProductMediaPickerItem;

export type MediaPickerRequest = {
  onInsert: (item: MediaPickerItem) => void;
  onCancel: () => void;
};

export type MediaPickerAdapter = (request: MediaPickerRequest) => void;

export type MediaPickerHandle = {
  productId: string;
  open: MediaPickerAdapter;
};

export function createMediaPickerHandle(
  productId: string,
  open: MediaPickerAdapter,
): MediaPickerHandle {
  return { productId, open };
}

export function useMediaPicker(
  productId: string | undefined,
  open: MediaPickerAdapter | undefined,
): MediaPickerHandle | undefined {
  return useMemo(() => {
    if (!productId || !open) return undefined;
    return { productId, open };
  }, [productId, open]);
}

const escapeAttribute = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

export function buildMediaImageHtml(item: MediaPickerItem, options: { figure?: boolean } = {}): string {
  if (options.figure) {
    // Articles: the visible caption is a real <figcaption>, which survives sanitization (a title attribute does not).
    const caption = item.caption ? `<figcaption>${escapeAttribute(item.caption)}</figcaption>` : '';
    return `<figure><img data-media-id="${escapeAttribute(item.id)}" src="${escapeAttribute(item.url)}" alt="${escapeAttribute(item.alt)}" width="${item.width}" height="${item.height}" />${caption}</figure>`;
  }
  const id = escapeAttribute(item.id);
  const alt = escapeAttribute(item.alt);
  const url = escapeAttribute(item.url);
  const caption = item.caption ? ` title="${escapeAttribute(item.caption)}"` : '';
  return `<img data-media-id="${id}" src="${url}" alt="${alt}"${caption} width="${item.width}" height="${item.height}" />`;
}