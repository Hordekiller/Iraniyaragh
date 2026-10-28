import type { Metadata } from 'next'

export const STORE_NAME = 'ایرانی یراق'
export type SearchParams = Record<string, string | string[] | undefined>

/** Configured identity only: request Host/forwarded headers can never affect URLs. */
export function publicOrigin(env: NodeJS.ProcessEnv = process.env): string {
  const value = env.PUBLIC_WEB_ORIGIN ?? (env.NODE_ENV !== 'production' ? 'http://localhost:3000' : '')
  let url: URL
  try { url = new URL(value) } catch { throw new Error('PUBLIC_WEB_ORIGIN is required and must be an absolute origin') }
  if (url.origin !== value || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('PUBLIC_WEB_ORIGIN must be an origin without path, credentials or trailing slash')
  if (env.NODE_ENV === 'production' && (url.protocol !== 'https:' || url.hostname.startsWith('www.') || url.port || !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/u.test(url.hostname) || /(?:^|\.)(?:localhost|local|internal|test|invalid)$/u.test(url.hostname))) throw new Error('PUBLIC_WEB_ORIGIN must be the configured HTTPS apex origin')
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Invalid public origin protocol')
  return url.origin
}

export function isProductionDiscovery() { return process.env.APP_ENVIRONMENT === 'production' }

export function validSlug(slug: string): boolean {
  return slug.length <= 250 && slug === slug.normalize('NFC') && /^[a-z0-9\u0621-\u063A\u0641-\u0642\u0644-\u0648\u067E\u0686\u0698\u06A9\u06AF\u06CC\u06F0-\u06F9]+(?:-[a-z0-9\u0621-\u063A\u0641-\u0642\u0644-\u0648\u067E\u0686\u0698\u06A9\u06AF\u06CC\u06F0-\u06F9]+)*$/u.test(slug)
}
export function entityPath(kind: 'products' | 'categories' | 'brands', slug: string) { return `/${kind}/${encodeURIComponent(slug)}` }
export function absolute(path: string) { return `${publicOrigin()}${path}` }
export function pageNumber(params: SearchParams): number | null {
  const value = params.page
  if (value === undefined) return 1
  return typeof value === 'string' && /^[1-9]\d{0,5}$/u.test(value) ? Number(value) : null
}
export function hasNonPageQuery(params: SearchParams) { return Object.keys(params).some(key => key !== 'page') }
export function metadataFor({ title, description, path, indexable = true, image }: { title: string; description: string; path: string; indexable?: boolean; image?: string }): Metadata {
  const url = absolute(path)
  return {
    title: `${title} | ${STORE_NAME}`, description,
    alternates: { canonical: url },
    robots: { index: isProductionDiscovery() && indexable, follow: isProductionDiscovery() },
    openGraph: { type: 'website', locale: 'fa_IR', siteName: STORE_NAME, title, description, url, ...(image ? { images: [image] } : {}) },
    twitter: { card: image ? 'summary_large_image' : 'summary', title, description, ...(image ? { images: [image] } : {}) },
  }
}
