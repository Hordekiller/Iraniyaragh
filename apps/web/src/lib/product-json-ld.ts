import type { CatalogProduct } from '../services/catalog/types'
import { defaultCatalogVariant } from '../services/catalog/variants'

/** Describe the visible default choice, without inventing a variant-group policy. */
export function productStructuredData(product: CatalogProduct, url: string, description: string, variant = defaultCatalogVariant(product.variants)) {
  // An incomplete Product fails Google's required-properties contract. Missing
  // catalog prices are not free offers; breadcrumbs/content remain available.
  if (!variant || product.priceAvailable === false || variant.price?.currency !== 'IRR' || !/^\d+$/u.test(variant.price.amount)) return null
  const images = product.media.filter(item => item.kind === 'IMAGE').flatMap(item => item.sources.map(source => source.url))
  let availability: string | undefined
  if (variant.stockStatus === 'OUT_OF_STOCK') availability = 'https://schema.org/OutOfStock'
  else if (variant.stockStatus === 'IN_STOCK' || variant.stockStatus === 'LOW_STOCK') availability = 'https://schema.org/InStock'
  return {
    '@context': 'https://schema.org', '@type': 'Product', name: product.name, url,
    ...(images.length ? { image: images } : {}),
    ...(description ? { description } : {}),
    ...(product.brand ? { brand: { '@type': 'Brand', name: product.brand } } : {}),
    ...(variant.sku ? { sku: variant.sku } : {}),
    offers: { '@type': 'Offer', url, price: variant.price.amount, priceCurrency: 'IRR', ...(availability ? { availability } : {}) },
  }
}
