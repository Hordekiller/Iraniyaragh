import { Parser } from 'htmlparser2'
import type { BlogPublicPost, BlogPublicSummary, PublicReviewList } from '@iranyaragh/contracts'
import type { CatalogProduct } from '../services/catalog/types'
import { serializeJsonLd } from '../lib/json-ld'
import { absolute, entityPath, STORE_NAME } from './policy'
import { INSTAGRAM_URL, SITE_ADDRESS_LINE, SITE_EMAIL, SITE_PHONE, SITE_MOBILE, SITE_POSTAL_CODE } from '../lib/site-config'
import { productStructuredData, productVariantGroup } from '../lib/product-json-ld'
import { requestedCatalogVariant, variantUrl } from '../services/catalog/variants'

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

export function productJsonLd(product: CatalogProduct, reviews: PublicReviewList | null = null, variantId?: string) {
  const url = absolute(entityPath('products', product.slug))
  const variant = requestedCatalogVariant(product.variants, variantId)
  const description = plainDescription(product.description)
  const group = productVariantGroup(product, url, description, undefined, reviews)
  if (group) {
    // Google's single-page pattern is one ProductGroup with nested sellable
    // variants. A second top-level Product for the selected variant duplicates
    // its properties when Google merges the graph.
    return { ...group, hasVariant: group.hasVariant.map(child => child && ({ ...child, offers: { ...child.offers, seller: { ...child.offers.seller, '@id': absolute('/#organization'), url: absolute('/') } } })) }
  }
  const selected = variant
  const schema = productStructuredData(product, selected ? variantUrl(url, selected.id) : url, description, selected ?? undefined, undefined, reviews)
  if (!schema) return null
  return { ...schema, offers: { ...schema.offers, seller: { ...schema.offers.seller, '@id': absolute('/#organization'), url: absolute('/') } } }
}

/** Organization identity. Contact fields appear only when the deployment configured verified values. */
export function organizationJsonLd() {
  return {
    '@context': 'https://schema.org', '@type': 'Organization', '@id': absolute('/#organization'), name: STORE_NAME, url: absolute('/'),
    description: 'فروشگاه تخصصی یراق‌آلات کابینت و ابزار', knowsAbout: ['یراق‌آلات کابینت', 'ابزار', 'ساخت درب سفارشی'],
    logo: { '@type': 'ImageObject', url: absolute('/brand/wordmark-print.png?v=20261104'), width: 1086, height: 370 },
    ...(INSTAGRAM_URL ? { sameAs: [INSTAGRAM_URL] } : {}),
    ...(SITE_EMAIL ? { email: SITE_EMAIL } : {}),
    ...((SITE_PHONE || SITE_MOBILE) ? { contactPoint: [...new Set([SITE_PHONE, SITE_MOBILE].filter((phone): phone is string => !!phone))].map(telephone => ({ '@type': 'ContactPoint', telephone, contactType: 'customer service', areaServed: 'IR', availableLanguage: 'fa' })) } : {}),
    ...(SITE_ADDRESS_LINE ? { address: { '@type': 'PostalAddress', streetAddress: SITE_ADDRESS_LINE, addressCountry: 'IR', ...(SITE_POSTAL_CODE ? { postalCode: SITE_POSTAL_CODE } : {}) } } : {}),
  }
}
/** Site entity without SearchAction: internal search results are intentionally non-indexable. */
export function websiteJsonLd() {
  return { '@context': 'https://schema.org', '@type': 'WebSite', '@id': absolute('/#website'), url: absolute('/'), name: STORE_NAME, inLanguage: 'fa-IR', publisher: { '@id': absolute('/#organization') } }
}

/** Describe the actual document; contact/about pages refer to the same verified store. */
export function webpageJsonLd({ title, description, path, type = 'WebPage' }: { title: string; description: string; path: string; type?: 'WebPage' | 'ContactPage' | 'AboutPage' | 'CollectionPage' }) {
  const url = absolute(path)
  return {
    '@context': 'https://schema.org', '@type': type, '@id': `${url}#webpage`, url,
    name: title, description, inLanguage: 'fa-IR', isPartOf: { '@id': absolute('/#website') },
    publisher: { '@id': absolute('/#organization') },
    ...(['ContactPage', 'AboutPage'].includes(type) ? { mainEntity: { '@id': absolute('/#organization') }, about: { '@id': absolute('/#organization') } } : {}),
  }
}
/** Collection landing page with an ItemList of the visible products on this page. */
export function collectionJsonLd({ name, path, products, offset }: { name: string; path: string; products: { slug: string; name: string }[]; offset: number }) {
  return {
    '@context': 'https://schema.org', '@type': 'CollectionPage', '@id': `${absolute(path)}#collection`, url: absolute(path), name, inLanguage: 'fa-IR', isPartOf: { '@id': absolute('/#website') },
    ...(products.length ? { mainEntity: { '@type': 'ItemList', numberOfItems: products.length, itemListElement: products.map((item, index) => ({ '@type': 'ListItem', position: offset + index + 1, url: absolute(entityPath('products', item.slug)), name: item.name })) } } : {}),
  }
}

const publisher = () => ({ '@type': 'Organization', '@id': absolute('/#organization'), name: STORE_NAME, url: absolute('/'), logo: { '@type': 'ImageObject', url: absolute('/brand/wordmark-print.png?v=20261104') } })
/** Article node. Author is the store: staff names are never published. Dates come from stored timestamps. */
export function articleJsonLd(post: BlogPublicPost, wordCount: number) {
  const url = absolute(`/blog/${encodeURIComponent(post.slug)}`)
  return {
    '@context': 'https://schema.org', '@type': 'BlogPosting', '@id': `${url}#article`, url, mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    headline: [...post.title].slice(0, 110).join(''), description: post.excerpt, inLanguage: 'fa-IR',
    datePublished: post.publishedAt, dateModified: post.updatedAt, author: publisher(), publisher: publisher(), wordCount,
    ...(post.cover ? { image: [post.cover.url] } : {}),
    ...(post.tags.length ? { keywords: post.tags.join('، ') } : {}),
    ...(post.sources.length ? { citation: post.sources.map(source => ({ '@type': 'CreativeWork', name: source.title, url: source.url })) } : {}),
  }
}
/** Blog index as a CollectionPage whose ItemList mirrors the visible cards. */
export function blogIndexJsonLd(posts: BlogPublicSummary[], path: string, offset: number) {
  return {
    '@context': 'https://schema.org', '@type': 'CollectionPage', '@id': `${absolute(path)}#collection`, url: absolute(path), name: 'مقالات و راهنماها', inLanguage: 'fa-IR', isPartOf: { '@id': absolute('/#website') },
    mainEntity: { '@type': 'ItemList', numberOfItems: posts.length, itemListElement: posts.map((post, index) => ({ '@type': 'ListItem', position: offset + index + 1, url: absolute(`/blog/${encodeURIComponent(post.slug)}`), name: post.title })) },
  }
}
