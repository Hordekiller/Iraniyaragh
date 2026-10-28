/** Canonicals are configuration, never request Host/forwarded-header data. */
export function parsePublicWebOrigin(value: unknown, environment: string): string | undefined {
  if (value === undefined || value === '') {
    if (environment === 'production') throw new Error('PUBLIC_WEB_ORIGIN is required in production.');
    return undefined;
  }
  if (typeof value !== 'string') throw new Error('PUBLIC_WEB_ORIGIN must be an HTTPS apex origin.');
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('PUBLIC_WEB_ORIGIN must be an HTTPS apex origin.'); }
  if (url.protocol !== 'https:' || url.origin !== value || url.username || url.password || url.port
    || url.hostname.startsWith('www.') || !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/u.test(url.hostname)
    || /(?:^|\.)(?:localhost|local|internal|test|invalid)$/u.test(url.hostname)) {
    throw new Error('PUBLIC_WEB_ORIGIN must be an HTTPS apex origin without port, path, credentials, query, fragment or trailing slash.');
  }
  return url.origin;
}

/** Accept existing canonical slugs; never silently normalize into another entity. */
export function isCanonicalSlug(slug: string): boolean {
  return slug.length > 0 && slug.length <= 250 && slug === slug.normalize('NFC')
    && /^[a-z0-9\u0621-\u063a\u0641-\u0642\u0644-\u0648\u067e\u0686\u0698\u06a9\u06af\u06cc\u06f0-\u06f9]+(?:-[a-z0-9\u0621-\u063a\u0641-\u0642\u0644-\u0648\u067e\u0686\u0698\u06a9\u06af\u06cc\u06f0-\u06f9]+)*$/u.test(slug);
}

export function escapeXml(value: string): string {
  return value.replace(/[&<>"']/gu, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]!);
}

export const DISCOVERY_KINDS = ['products', 'categories', 'brands'] as const;
export type DiscoveryKind = typeof DISCOVERY_KINDS[number];
export function isDiscoveryKind(kind: string): kind is DiscoveryKind {
  return DISCOVERY_KINDS.some(candidate => candidate === kind);
}
export const XML_HEADER = '<?xml version="1.0" encoding="UTF-8"?>';
export const SITEMAP_NAMESPACE = 'http://www.sitemaps.org/schemas/sitemap/0.9';
