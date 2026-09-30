import type { Money, ProductListMeta, CategorySummary, PublicProductMedia } from '@iranyaragh/contracts'

/**
 * Storefront-facing catalog view types.
 *
 * The canonical domain types live in `@iranyaragh/contracts` (single source of
 * truth, docs/FOUNDATION.md §6). This module declares the slim read-model the
 * storefront renders, projecting contract data into a UI-friendly shape. Money
 * is always a contract `Money` (IRR) value; presentation (Toman / Persian
 * digits) stays in `lib/format.ts` and components.
 */

export type StockStatus = 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK' | 'UNKNOWN'

/**
 * A sellable variant of a product, surfaced from the public catalog detail.
 * `id` is the `variantId` the cart/checkout API keys its lines by.
 */
export type StorefrontVariant = {
  id: string
  sku: string
  /** Human label from variant attributes (e.g. «سایز ۵»); null for single-variant products. */
  title: string | null
  /** This variant's own sale price, in IRR. */
  salePrice: Money
  /** Package weight in grams, when the catalog records one; null when unknown. */
  weightGrams: number | null
  /** Coarse public availability for this variant (IN_STOCK/LOW_STOCK = true). */
  available: boolean
  lowStock: boolean
}

export type CatalogProduct = {
  id: string
  slug: string
  name: string
  brand: string | null
  category: { id: string; name: string; slug: string; parentId: string | null } | null
  image: string
  /** Ordered ready media gallery for the product detail page (contract union). */
  media: PublicProductMedia[]
  description: string | null
  /** Lowest active-variant sale price, in IRR (Rial). */
  price: Money
  oldPrice: Money | null
  rating: number | null
  reviews: number
  stockStatus: StockStatus
  badge: string | null
  /** Active sellable variants; empty for list items (only the detail resolves them). */
  variants: StorefrontVariant[]
  /** Preferred variant id for add-to-cart; null when no active variant is known. */
  defaultVariantId: string | null
}

/**
 * Listing options offered by the storefront. `name`/`name_desc` map onto the
 * public contract's `sortBy=name` with an ascending/descending direction; the
 * contract has no price or popularity ranking, so none is offered here.
 */
export type CatalogSort = 'newest' | 'name' | 'name_desc'

/** Page size for storefront listings; the API caps a page at 100. */
export const LISTING_PER_PAGE = 24
export const LISTING_MAX_PER_PAGE = 100

export type CatalogQuery = {
  search?: string
  categorySlug?: string
  brand?: string
  sortBy?: CatalogSort
  /** 1-based page index. */
  page?: number
  /** Page size; the API caps this at 100. */
  perPage?: number
}

/** Categories exposed to the storefront browsing UI. */
export type CatalogCategory = {
  id: string
  name: string
  slug: string
  /** Parent category id, so the storefront can build the real ancestor trail. */
  parentId: string | null
  productCount: number
  image: string
}

/** Brands present in the live catalog (marquee / filter chips). */
export type CatalogBrand = {
  id: string
  name: string
  slug: string
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
  listBrands(): Promise<CatalogBrand[]>
  listProducts(query?: CatalogQuery): Promise<CatalogListResult>
  getProductBySlug(slug: string): Promise<CatalogProduct>
}

export type { CategorySummary, Money }
