import { Parser } from 'htmlparser2'
import type { CatalogProduct } from '../services/catalog/types'
import { serializeJsonLd } from '../lib/json-ld'
import { absolute, entityPath } from './policy'

export function JsonLd({ data }: { data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />
}
export function breadcrumb(items: { name: string; path: string }[]) {
  return { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: items.map((item, index) => ({ '@type': 'ListItem', position: index + 1, name: item.name, item: absolute(item.path) })) }
}
/** Plain text extraction, never a regex-based HTML sanitizer. Embedding stays escaped. */
export function plainDescription(html: string | null) {
  const text: string[] = []
  const hidden = new Set(['script', 'style', 'template'])
  let hiddenDepth = 0
  const parser = new Parser({
    onopentag(name) { if (hidden.has(name)) hiddenDepth++; if (!hiddenDepth) text.push(' ') },
    ontext(value) { if (!hiddenDepth) text.push(value) },
    onclosetag(name) { if (hidden.has(name) && hiddenDepth) hiddenDepth--; if (!hiddenDepth) text.push(' ') },
  }, { decodeEntities: true })
  parser.end(html ?? '')
  return text.join('').replace(/\s+/gu, ' ').trim()
}

export function productJsonLd(product: CatalogProduct) {
  const images = product.media.filter(item => item.kind === 'IMAGE').flatMap(item => item.sources.map(source => source.url))
  const url = absolute(entityPath('products', product.slug))
  // Variant grouping policy is not approved: one unambiguous variant only. No guessed ratings, shipping or inventory.
  const variant = product.variants.length === 1 ? product.variants[0] : null
  const availability = variant?.stockStatus === 'OUT_OF_STOCK' ? 'https://schema.org/OutOfStock' : variant?.stockStatus === 'IN_STOCK' || variant?.stockStatus === 'LOW_STOCK' ? 'https://schema.org/InStock' : undefined
  return {
    '@context': 'https://schema.org', '@type': 'Product', name: product.name, url,
    ...(images.length ? { image: images } : {}),
    ...(product.description ? { description: plainDescription(product.description) } : {}),
    ...(product.brand ? { brand: { '@type': 'Brand', name: product.brand } } : {}),
    ...(variant?.sku ? { sku: variant.sku } : {}),
    ...(variant && /^\d+$/u.test(variant.price.amount) && variant.price.currency === 'IRR' ? { offers: { '@type': 'Offer', url, price: variant.price.amount, priceCurrency: 'IRR', ...(availability ? { availability } : {}) } } : {}),
  }
}
