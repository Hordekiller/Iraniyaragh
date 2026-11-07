import type { PublicReviewList } from '@iranyaragh/contracts'
import type { CatalogProduct } from '../services/catalog/types'
import { defaultCatalogVariant } from '../services/catalog/variants'
import { SITE_NAME } from './site-config'

/** Describe the visible default choice, without inventing a variant-group policy. */
export function productStructuredData(product: CatalogProduct, url: string, description: string, variant = defaultCatalogVariant(product.variants), sellerName = SITE_NAME, reviews: PublicReviewList | null = null) {
  // An incomplete Product fails Google's required-properties contract. Missing
  // catalog prices are not free offers; breadcrumbs/content remain available.
  if (!variant || product.priceAvailable === false || variant.price?.currency !== 'IRR' || !/^\d+$/u.test(variant.price.amount)) return null
  const images = product.media.filter(item => item.kind === 'IMAGE').flatMap(item => item.sources.map(source => source.url))
  let availability: string | undefined
  if (variant.stockStatus === 'OUT_OF_STOCK') availability = 'https://schema.org/OutOfStock'
  else if (variant.stockStatus === 'IN_STOCK' || variant.stockStatus === 'LOW_STOCK') availability = 'https://schema.org/InStock'
  // Only real, moderated, verified-purchase reviews are described; with none, no rating markup exists.
  const rated = reviews && reviews.summary.count > 0 && reviews.summary.average !== null ? reviews : null
  return {
    '@context': 'https://schema.org', '@type': 'Product', '@id': `${url}#product`, name: product.name, url, inLanguage: 'fa-IR',
    ...(images.length ? { image: images } : {}),
    ...(description ? { description } : {}),
    ...(product.category?.name ? { category: product.category.name } : {}),
    ...(product.brand ? { brand: { '@type': 'Brand', name: product.brand } } : {}),
    ...(variant.sku ? { sku: variant.sku } : {}),
    ...(rated ? {
      aggregateRating: { '@type': 'AggregateRating', ratingValue: rated.summary.average, reviewCount: rated.summary.count, bestRating: 5, worstRating: 1 },
      review: rated.items.slice(0, 5).map(item => ({
        '@type': 'Review', author: { '@type': 'Person', name: item.authorName }, datePublished: item.publishedAt.slice(0, 10),
        reviewRating: { '@type': 'Rating', ratingValue: item.rating, bestRating: 5, worstRating: 1 },
        ...(item.title ? { name: item.title } : {}), reviewBody: item.body,
      })),
    } : {}),
    offers: { '@type': 'Offer', url, price: variant.price.amount, priceCurrency: 'IRR', seller: { '@type': 'Organization', name: sellerName }, ...(availability ? { availability } : {}) },
  }
}
