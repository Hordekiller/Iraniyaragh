import type { CatalogVariant } from './types'

/** The same initial choice must be visible to shoppers and described to crawlers. */
export function defaultCatalogVariant(variants: CatalogVariant[]): CatalogVariant | null {
  return variants.find(variant => variant.stockStatus === 'IN_STOCK' || variant.stockStatus === 'LOW_STOCK') ?? variants[0] ?? null
}
