import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { InvoicePdfInputError } from './invoice-pdf-template';

const FONT_RELATIVE = join('fonts', 'Vazirmatn[wght].woff2');
const WORDMARK_RELATIVE = join('brand', 'wordmark-print.png');
// Identical depth from dist (modules/invoices) and src (vitest) to the web assets.
const REPO_FALLBACK_DIR = resolve(__dirname, '../../../../../web/public');

// Exactized bytes are read once per process and pinned by the template hashes;
// a later file replacement can no longer mutate in-flight render evidence.
export type InvoicePdfAssets = { fontWoff2: Buffer; wordmarkPng: Buffer };
export const invoicePdfAssetHashes = {
  font: '4e3fa217d38fdafc1fea4414ceb58ca5e662cf0ab5fa735a8c8c20e8b42cad92',
  brand: '457401b43c2c484ced56e1858da9c84a0998d86099ab0935e82bad90f69cbcc4',
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
