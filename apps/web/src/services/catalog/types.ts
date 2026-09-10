import type { Money, ProductListMeta, CategorySummary } from '@iranyaragh/contracts'

/**
 * Storefront-facing catalog view types.
 *
 * The canonical domain types live in `@iranyaragh/contracts` (single source of
 * truth, docs/FOUNDATION.md §6). This module declares the slim read-model the
 * storefront renders, projecting contract data into a UI-friendly shape. Money
 * is always a contract `Money` (IRR) value; presentation (Toman / Persian
 * digits) stays in `lib/format.ts` and components.
 */

export type StockStatus = 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK'

export type CatalogProduct = {
  id: string
  slug: string
  name: string
  brand: string | null
  category: { id: string; name: string; slug: string } | null
  image: string
  description: string | null
  /** Lowest active-variant sale price, in IRR (Rial). */
  price: Money
  oldPrice: Money | null
  rating: number | null
  reviews: number
  stockStatus: StockStatus
  badge: string | null
}

export type CatalogQuery = {
  search?: string
  categorySlug?: string
  brand?: string
  sortBy?: 'popular' | 'price_asc' | 'price_desc' | 'newest'
}

/** Categories exposed to the storefront browsing UI. */
export type CatalogCategory = {
  id: string
  name: string
  slug: string
  productCount: number
  image: string
}

export type CatalogListResult = {
  items: CatalogProduct[]
  meta: ProductListMeta
}

/**
 * The catalog access port used by the storefront. A real HTTP client and the
 * contract fixture client are swappable without touching the UI (parallel-work
 * model; see docs/AGENT_WORKSTREAMS.md, User UI lane). All methods resolve
 * view models or reject — they never silently fake data in a shipped build.
 */
export interface CatalogApi {
  listCategories(): Promise<CatalogCategory[]>
  listProducts(query?: CatalogQuery): Promise<CatalogListResult>
  getProductBySlug(slug: string): Promise<CatalogProduct>
}

export type { CategorySummary, Money }
