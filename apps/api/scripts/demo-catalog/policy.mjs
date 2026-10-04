import { assertDemoStagingEnvironment } from '../../prisma/demo-staging-policy.mjs';

export function assertCatalogDemoEnvironment(environment) {
  const target = assertDemoStagingEnvironment(environment);
  if (environment.SMS_PROVIDER_MODE !== 'disabled' || environment.PAYMENT_PROVIDER_MODE !== 'disabled') {
    throw new Error('Catalog demos require both SMS and payment providers disabled.');
  }
  if (!environment.PRODUCT_MEDIA_SCANNER_HOST) throw new Error('Catalog demos require the real private malware scanner.');
  if (environment.AUTH_FIXTURE_MODE === 'true' || environment.MEDIA_PROCESSOR_MODE === 'fixture') {
    throw new Error('Catalog demos require real authentication configuration and media processing.');
  }
  return target;
}

export function validateCatalogDemoManifest(manifest) {
  if (manifest.version !== 1 || manifest.products.length !== 15) throw new Error('Unexpected demo manifest.');
  const slugs = new Set();
  const ids = new Set();
  for (const product of manifest.products) {
    if (!/^demo-v1-[a-z0-9-]+$/u.test(product.slug) || !product.name.startsWith('[دمو] ') || slugs.has(product.slug) || ids.has(product.sourceId)) throw new Error('Demo identities must be unique, namespaced and labelled.');
    slugs.add(product.slug); ids.add(product.sourceId);
    for (const price of [product.costPriceIRR, product.salePriceIRR]) if (!/^\d{1,15}$/u.test(price)) throw new Error('Demo prices must be integer IRR.');
    if (!['hero1.jpg', 'hero2.jpg', 'tool2.jpg', 'tool3.jpg'].includes(product.image)) throw new Error('Unexpected demo image.');
    if (!['power', 'hand', 'pneumatic', 'safety', 'measuring', 'garden'].includes(product.category)) throw new Error('Unexpected demo category.');
  }
}

// Only the configured HTTPS storage/public-media prefix can receive sample
// bytes or supply public images. Redirects are rejected by the caller.
export function assertCatalogDemoUrl(value, configuredPrefix, { signedUpload = false } = {}) {
  const url = new URL(value);
  const prefix = new URL(configuredPrefix);
  if (prefix.protocol !== 'https:' || prefix.username || prefix.password || prefix.search || prefix.hash ||
      url.protocol !== 'https:' || url.username || url.password || url.hash ||
      url.origin !== prefix.origin || !url.pathname.startsWith(`${prefix.pathname.replace(/\/$/u, '')}/`) ||
      (!signedUpload && url.search)) {
    throw new Error('Demo HTTP target must remain inside the configured HTTPS media prefix.');
  }
  return url;
}
