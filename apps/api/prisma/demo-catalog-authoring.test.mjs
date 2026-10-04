import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { assertCatalogDemoEnvironment, assertCatalogDemoUrl, validateCatalogDemoManifest } from '../scripts/demo-catalog/policy.mjs';

const environment = { PRODUCT_MEDIA_SCANNER_HOST: 'private-clamd', NODE_ENV: 'staging', ALLOW_DEMO_STAGING_DATA: 'true', DATABASE_URL: 'postgresql://demo:demo@localhost/catalog_staging', SMS_PROVIDER_MODE: 'disabled', PAYMENT_PROVIDER_MODE: 'disabled' };
test('catalog demo refuses production, live providers, fixtures and missing opt-in', () => {
  assert.doesNotThrow(() => assertCatalogDemoEnvironment(environment));
  for (const overrides of [{ PRODUCT_MEDIA_SCANNER_HOST: '' }, { NODE_ENV: 'production' }, { NODE_ENV: 'test' }, { ALLOW_DEMO_STAGING_DATA: 'false' }, { SMS_PROVIDER_MODE: 'mock' }, { PAYMENT_PROVIDER_MODE: 'live' }, { AUTH_FIXTURE_MODE: 'true' }, { MEDIA_PROCESSOR_MODE: 'fixture' }]) {
    assert.throws(() => assertCatalogDemoEnvironment({ ...environment, ...overrides }));
  }
});

test('demo file uploads and public reads are fenced to their configured HTTPS origin/path', () => {
  const prefix = 'https://staging.example/storage-upload';
  assert.doesNotThrow(() => assertCatalogDemoUrl(`${prefix}/products/sample.jpg?X-Amz-Signature=test`, prefix, { signedUpload: true }));
  for (const target of ['http://staging.example/storage-upload/products/a.jpg', 'https://attacker.example/storage-upload/products/a.jpg', 'https://staging.example/storage-upload-evil/a.jpg', 'https://user:secret@staging.example/storage-upload/products/a.jpg', 'https://staging.example/storage-upload/products/a.jpg#x']) {
    assert.throws(() => assertCatalogDemoUrl(target, prefix, { signedUpload: true }));
  }
  assert.throws(() => assertCatalogDemoUrl('https://staging.example/media/products/a.jpg?X-Amz-Signature=test', 'https://staging.example/media/products'));
  assert.doesNotThrow(() => assertCatalogDemoUrl('https://staging.example/media/products/a.jpg', 'https://staging.example/media/products'));
});
test('prior demo manifest has labelled independent identities and explicit integer IRR', async () => {
  const manifest = JSON.parse(await readFile(new URL('../scripts/demo-catalog/manifest.json', import.meta.url), 'utf8'));
  assert.doesNotThrow(() => validateCatalogDemoManifest(manifest));
  for (const override of [{ name: 'Unlabelled' }, { slug: 'real-product' }, { salePriceIRR: '1.5' }, { costPriceIRR: '-100' }, { image: '../secret' }]) {
    assert.throws(() => validateCatalogDemoManifest({ ...manifest, products: [{ ...manifest.products[0], ...override }, ...manifest.products.slice(1)] }));
  }
});
