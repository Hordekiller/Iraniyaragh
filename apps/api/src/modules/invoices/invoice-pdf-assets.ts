import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { INVOICE_PDF_ASSETS, InvoicePdfInputError } from './invoice-pdf-template';

const FONT_RELATIVE = join('fonts', 'Vazirmatn[wght].woff2');
const WORDMARK_RELATIVE = join('brand', 'wordmark-print.png');
// Identical depth from dist (modules/invoices) and src (vitest) to the web assets.
const REPO_FALLBACK_DIR = resolve(__dirname, '../../../../../web/public');

// Exactized bytes are read once per process and pinned by the template hashes;
// a later file replacement can no longer mutate in-flight render evidence.
export type InvoicePdfAssets = { fontWoff2: Buffer; wordmarkPng: Buffer };
export const invoicePdfAssetHashes = {
  font: INVOICE_PDF_ASSETS.fontSha256,
  brand: INVOICE_PDF_ASSETS.brandSha256,
} as const;

function hash(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function readAsset(dir: string, relative: string): Buffer {
  const bytes = readFileSync(join(dir, relative));
  if (bytes.length === 0 || bytes.length > 1_048_576) throw new InvoicePdfInputError();
  return bytes;
}

export class InvoicePdfAssetsProvider {
  private cached?: InvoicePdfAssets;
  constructor(private readonly assetsDir?: string) {}

  load(): InvoicePdfAssets {
    this.cached ??= this.read();
    return this.cached;
  }

  private read(): InvoicePdfAssets {
    const baseDir = this.assetsDir ?? REPO_FALLBACK_DIR;
    const fontWoff2 = readAsset(baseDir, FONT_RELATIVE);
    const wordmarkPng = readAsset(baseDir, WORDMARK_RELATIVE);
    if (hash(fontWoff2) !== invoicePdfAssetHashes.font || hash(wordmarkPng) !== invoicePdfAssetHashes.brand) {
      throw new InvoicePdfInputError();
    }
    return { fontWoff2, wordmarkPng };
  }
}
