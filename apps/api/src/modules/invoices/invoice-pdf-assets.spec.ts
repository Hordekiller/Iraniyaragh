import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { InvoicePdfAssetsProvider, invoicePdfAssetHashes } from './invoice-pdf-assets';
import { INVOICE_PDF_ASSETS, InvoicePdfInputError } from './invoice-pdf-template';

const approvedDir = resolve(__dirname, '../../../../web/public');
const hash = (value: Buffer) => createHash('sha256').update(value).digest('hex');

describe('Invoice PDF approved asset boundary', () => {
  it('loads the same approved print bytes pinned by existing template revisions', () => {
    const provider = new InvoicePdfAssetsProvider(approvedDir);
    const assets = provider.load();
    expect(hash(assets.fontWoff2)).toBe(INVOICE_PDF_ASSETS.fontSha256);
    expect(hash(assets.wordmarkPng)).toBe(INVOICE_PDF_ASSETS.brandSha256);
    expect(invoicePdfAssetHashes.brand).toBe(INVOICE_PDF_ASSETS.brandSha256);
    expect(provider.load()).toBe(assets);
  });

  it('rejects replacement print bytes even when their filename and size match', () => {
    const dir = mkdtempSync(join(tmpdir(), 'iranyaragh-pdf-assets-test-'));
    try {
      mkdirSync(join(dir, 'fonts'));
      mkdirSync(join(dir, 'brand'));
      writeFileSync(join(dir, 'fonts', 'Vazirmatn[wght].woff2'), readFileSync(join(approvedDir, 'fonts', 'Vazirmatn[wght].woff2')));
      const replaced = readFileSync(join(approvedDir, 'brand', 'wordmark-print.png'));
      replaced[replaced.length - 1] ^= 1;
      writeFileSync(join(dir, 'brand', 'wordmark-print.png'), replaced);
      expect(() => new InvoicePdfAssetsProvider(dir).load()).toThrow(InvoicePdfInputError);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
