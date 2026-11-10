import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { INVOICE_PDF_ASSETS, INVOICE_PDF_LEGACY_BRAND_SHA256, INVOICE_PDF_PREVIOUS_REVISIONS, INVOICE_PDF_TEMPLATE_REVISION, InvoicePdfInputError, invoicePdfUsesFirstWordmark } from './invoice-pdf-template';

const FONT_RELATIVE = join('fonts', 'Vazirmatn[wght].woff2');
const WORDMARK_RELATIVE = join('brand', 'wordmark-print.png');
// Identical depth from dist (modules/invoices) and src (vitest) to the web assets.
const REPO_FALLBACK_DIR = resolve(__dirname, '../../../../../web/public');

// Exactized bytes are read once per process and pinned by the template hashes;
// a later file replacement can no longer mutate in-flight render evidence.
export type InvoicePdfAssets = { fontWoff2: Buffer; wordmarkPng: Buffer };
export const invoicePdfAssetHashes = {
  font: '4e3fa217d38fdafc1fea4414ceb58ca5e662cf0ab5fa735a8c8c20e8b42cad92',
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
  private readonly cached = new Map<string, InvoicePdfAssets>();
  constructor(private readonly assetsDir?: string) {}

  load(templateRevision: string = INVOICE_PDF_TEMPLATE_REVISION): InvoicePdfAssets {
    if (![...INVOICE_PDF_PREVIOUS_REVISIONS, INVOICE_PDF_TEMPLATE_REVISION].includes(templateRevision)) throw new InvoicePdfInputError();
    let assets = this.cached.get(templateRevision);
    if (!assets) {
      assets = this.read(templateRevision);
      this.cached.set(templateRevision, assets);
    }
    return assets;
  }

  private read(templateRevision: string): InvoicePdfAssets {
    const baseDir = this.assetsDir ?? REPO_FALLBACK_DIR;
    const fontWoff2 = readAsset(baseDir, FONT_RELATIVE);
    const legacy = invoicePdfUsesFirstWordmark(templateRevision);
    const wordmarkPng = readAsset(baseDir, legacy ? join('brand', 'wordmark-print-v2.png') : WORDMARK_RELATIVE);
    if (hash(fontWoff2) !== invoicePdfAssetHashes.font || hash(wordmarkPng) !== (legacy ? INVOICE_PDF_LEGACY_BRAND_SHA256 : invoicePdfAssetHashes.brand)) {
      throw new InvoicePdfInputError();
    }
    return { fontWoff2, wordmarkPng };
  }
}
