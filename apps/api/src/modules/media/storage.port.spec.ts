import { describe, expect, it } from 'vitest';
import { mediaSourceObjectKey } from './storage.port';

describe('mediaSourceObjectKey', () => {
  it('derives the extension from the allowlisted MIME instead of the original filename', () => {
    expect(
      mediaSourceObjectKey({
        productId: 'product_1',
        mediaId: 'media_1',
        declaredMime: 'image/jpeg',
        nonce: 'nonce-1',
      }),
    ).toBe('quarantine/products/product_1/media_1/nonce-1.jpg');
  });

  it.each(['image/svg+xml', 'text/html', 'application/pdf', 'image/gif']) (
    'rejects unsupported MIME %s',
    declaredMime => {
      expect(() =>
        mediaSourceObjectKey({ productId: 'product', mediaId: 'media', declaredMime, nonce: 'nonce' }),
      ).toThrow('Unsupported product media MIME type.');
    },
  );

  it.each(['../product', 'product/id', '', 'محصول'])('rejects unsafe identifier %s', productId => {
    expect(() =>
      mediaSourceObjectKey({ productId, mediaId: 'media', declaredMime: 'image/png', nonce: 'nonce' }),
    ).toThrow('opaque safe path segments');
  });
});
