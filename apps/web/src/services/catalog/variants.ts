import type { CatalogVariant } from './types'

/** The same initial choice must be visible to shoppers and described to crawlers. */
export function defaultCatalogVariant(variants: CatalogVariant[]): CatalogVariant | null {
  return variants.find(variant => variant.stockStatus === 'IN_STOCK' || variant.stockStatus === 'LOW_STOCK') ?? variants[0] ?? null
}

/** A stable URL for one actual SKU, with the product's base URL as canonical. */
export function variantUrl(productUrl: string, variantId: string): string {
  return `${productUrl}?variant=${encodeURIComponent(variantId)}`
}

export function requestedCatalogVariant(variants: CatalogVariant[], value: string | string[] | undefined): CatalogVariant | null {
  return typeof value === 'string' ? variants.find(variant => variant.id === value) ?? null : null
}

export function validVariantQuery(variants: CatalogVariant[], query: Record<string, string | string[] | undefined>): boolean {
  const keys = Object.keys(query)
  return keys.length === 0 || (keys.length === 1 && keys[0] === 'variant' && requestedCatalogVariant(variants, query.variant) !== null)
}
