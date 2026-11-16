import type { PublicReviewList } from '@iranyaragh/contracts'
import type { CatalogProduct } from '../services/catalog/types'
import { defaultCatalogVariant } from '../services/catalog/variants'
import { variantUrl } from '../services/catalog/variants'
import { SITE_NAME } from './site-config'

/** Describe a real sellable choice with its published price and inventory state. */
export function productStructuredData(product: CatalogProduct, url: string, description: string, variant = defaultCatalogVariant(product.variants), sellerName = SITE_NAME, reviews: PublicReviewList | null = null) {
  // An incomplete Product fails Google's required-properties contract. Missing
  // catalog prices are not free offers; breadcrumbs/content remain available.
  if (!variant || product.priceAvailable === false || variant.price?.currency !== 'IRR' || !/^\d+$/u.test(variant.price.amount)) return null
  // One widest usable rendition per gallery image, without thumbnail duplication.
  const images = [...new Set(product.media.filter(item => item.kind === 'IMAGE').flatMap(item => {
    for (const source of [...item.sources].sort((a, b) => b.width - a.width)) {
      try {
        const image = new URL(source.url, /^https?:\/\//u.test(url) ? url : undefined)
        if (['https:', 'http:'].includes(image.protocol) && !image.username && !image.password) return [image.href]
      } catch { /* Try the next published rendition. */ }
    }
    return []
  }))]
  const attributes = variant.attributes.filter(item => item.attributeName.trim() && item.optionLabel.trim())
  // Codes are merchant-defined. Only exact standard codes carry standard semantics;
  // all other entered specifications retain their original name and value.
  const standardProperties: Record<string, string> = {}
  for (const item of attributes) {
    if (['color', 'size', 'material', 'pattern'].includes(item.attributeCode)) standardProperties[item.attributeCode] = item.optionLabel
  }
  let availability: string | undefined
  if (variant.stockStatus === 'OUT_OF_STOCK') availability = 'https://schema.org/OutOfStock'
  else if (variant.stockStatus === 'IN_STOCK' || variant.stockStatus === 'LOW_STOCK') availability = 'https://schema.org/InStock'
  // Only real, moderated, verified-purchase reviews are described; with none, no rating markup exists.
  const rated = reviews && Number.isSafeInteger(reviews.summary.count) && reviews.summary.count > 0 && reviews.summary.average !== null && Number.isFinite(reviews.summary.average) && reviews.summary.average >= 1 && reviews.summary.average <= 5 ? reviews : null
  return {
    '@context': 'https://schema.org', '@type': 'Product', '@id': `${url}#product`, name: product.name, url,
    ...standardProperties,
    ...(attributes.length ? { additionalProperty: attributes.map(item => ({ '@type': 'PropertyValue', propertyID: item.attributeCode, name: item.attributeName, value: item.optionLabel })) } : {}),
    ...(images.length ? { image: images } : {}),
    ...(description ? { description } : {}),
    // Store categories remain visible in breadcrumbs; Google currently flags the
    // Persian label as an invalid optional merchant category. Do not invent a GPC.
    ...(product.brand ? { brand: { '@type': 'Brand', name: product.brand } } : {}),
    ...(variant.sku ? { sku: variant.sku } : {}),
    ...(rated ? {
      aggregateRating: { '@type': 'AggregateRating', ratingValue: rated.summary.average, reviewCount: rated.summary.count, bestRating: 5, worstRating: 1 },
      review: rated.items.filter(item => item.verifiedPurchase && Number.isInteger(item.rating) && item.rating >= 1 && item.rating <= 5 && item.authorName.trim() && item.body.trim() && Number.isFinite(Date.parse(item.publishedAt))).slice(0, 5).map(item => ({
        '@type': 'Review', author: { '@type': 'Person', name: item.authorName }, datePublished: item.publishedAt.slice(0, 10),
        reviewRating: { '@type': 'Rating', ratingValue: item.rating, bestRating: 5, worstRating: 1 },
        ...(item.title ? { name: item.title } : {}), reviewBody: item.body,
      })),
    } : {}),
    offers: { '@type': 'Offer', url, price: variant.price.amount, priceCurrency: 'IRR', seller: { '@type': 'Organization', name: sellerName }, ...(availability ? { availability } : {}) },
  }
}

/** Single-page variant group: URLs select the same SKU the offer describes. */
export function productVariantGroup(product: CatalogProduct, url: string, description: string, sellerName = SITE_NAME, reviews: PublicReviewList | null = null) {
  const variants = product.variants
  if (variants.length < 2 || new Set(variants.map(item => item.sku)).size !== variants.length) return null
  const axes = variants[0].attributes.filter(attribute => attribute.isVariantAxis && variants.every(variant => variant.attributes.some(item => item.isVariantAxis && item.attributeCode === attribute.attributeCode)))
  if (!axes.length) return null
  const signatures = variants.map(variant => JSON.stringify(axes.map(axis => variant.attributes.find(item => item.attributeCode === axis.attributeCode)?.optionCode)))
  if (new Set(signatures).size !== variants.length) return null
  const children = variants.map(variant => {
    const schema = productStructuredData(product, variantUrl(url, variant.id), '', variant, sellerName)
    if (!schema) return null
    const label = variant.title || variant.attributes.filter(item => item.isVariantAxis).map(item => item.optionLabel).join(' / ') || variant.sku
    return { ...schema, name: `${product.name} — ${label}`, inProductGroupWithID: product.id }
  })
  if (children.some(child => child === null)) return null
  const shared = productStructuredData(product, url, description, undefined, sellerName, reviews)
  return {
    '@context': 'https://schema.org', '@type': 'ProductGroup', '@id': `${url}#product-group`,
    productGroupID: product.id, name: product.name, url,
    ...(description ? { description } : {}),
    ...(product.brand ? { brand: { '@type': 'Brand', name: product.brand } } : {}),
    ...(shared?.aggregateRating ? { aggregateRating: shared.aggregateRating, review: shared.review } : {}),
    variesBy: axes.map(axis => ['color', 'size', 'material', 'pattern'].includes(axis.attributeCode) ? `https://schema.org/${axis.attributeCode}` : axis.attributeName),
    hasVariant: children,
  }
}
