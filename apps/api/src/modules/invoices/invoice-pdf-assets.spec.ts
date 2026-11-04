import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { InvoicePdfAssetsProvider } from './invoice-pdf-assets';
import { INVOICE_PDF_ASSETS, INVOICE_PDF_LEGACY_BRAND_SHA256, InvoicePdfInputError } from './invoice-pdf-template';

describe('versioned invoice brand assets', () => {
  it('loads and caches the exact current and legacy assets separately', () => {
    const provider = new InvoicePdfAssetsProvider(resolve(__dirname, '../../../../web/public'));
    const current = provider.load();
    const legacy = provider.load('store-invoice-a4-v2');
    const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
    expect(hash(current.wordmarkPng)).toBe(INVOICE_PDF_ASSETS.brandSha256);
    expect(hash(legacy.wordmarkPng)).toBe(INVOICE_PDF_LEGACY_BRAND_SHA256);
    expect(provider.load()).toBe(current);
    expect(provider.load('store-invoice-a4-v2')).toBe(legacy);
    expect(hash(provider.load('store-invoice-a4-v1').wordmarkPng)).toBe(INVOICE_PDF_LEGACY_BRAND_SHA256);
    expect(current.fontWoff2.equals(legacy.fontWoff2)).toBe(true);
    expect(() => provider.load('../unknown-template')).toThrow(InvoicePdfInputError);
  });
});
