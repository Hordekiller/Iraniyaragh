import { randomUUID } from 'node:crypto';

export const PRODUCT_MEDIA_STORAGE = Symbol('PRODUCT_MEDIA_STORAGE');

export type PresignedPut = {
  url: string;
  requiredHeaders: Record<string, string>;
  expiresAt: Date;
};

export type StoredObjectHead = {
  objectKey: string;
  bytes: number;
  contentType: string | null;
  checksumSha256: string | null;
};

export interface ProductMediaStorage {
  presignPut(input: {
    objectKey: string;
    contentType: string;
    bytes: number;
    expiresInSeconds: number;
  }): Promise<PresignedPut>;
  headObject(objectKey: string): Promise<StoredObjectHead | null>;
  getObject(objectKey: string): Promise<NodeJS.ReadableStream>;
  deleteObject(objectKey: string): Promise<void>;
}

const EXTENSION_BY_MIME: Readonly<Record<string, string>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
};

const OPAQUE_ID = /^[A-Za-z0-9_-]{1,128}$/u;

export function mediaSourceObjectKey(input: {
  productId: string;
  mediaId: string;
  declaredMime: string;
  nonce?: string;
}): string {
  if (!OPAQUE_ID.test(input.productId) || !OPAQUE_ID.test(input.mediaId)) {
    throw new Error('Product and media identifiers must be opaque safe path segments.');
  }
  const extension = EXTENSION_BY_MIME[input.declaredMime];
  if (!extension) throw new Error('Unsupported product media MIME type.');
  const nonce = input.nonce ?? randomUUID();
  if (!OPAQUE_ID.test(nonce)) throw new Error('Media object nonce must be a safe path segment.');
  return `quarantine/products/${input.productId}/${input.mediaId}/${nonce}.${extension}`;
}
