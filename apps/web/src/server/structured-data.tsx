import { Parser } from 'htmlparser2'
import type { CatalogProduct } from '../services/catalog/types'
import { serializeJsonLd } from '../lib/json-ld'
import { absolute, entityPath } from './policy'
import { productStructuredData } from '../lib/product-json-ld'

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
  const url = absolute(entityPath('products', product.slug))
  return productStructuredData(product, url, plainDescription(product.description))
}
