import type {
  Money,
  ProductListMeta,
  CategorySummary,
  HomepageCollectionsConfig,
  HomepageBannerPublic,
  PublicProductMedia,
  VariantAttributeValue,
} from '@iranyaragh/contracts'

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

export type CatalogVariant = {
  id: string
  sku: string
  title: string | null
  price: Money
  attributes: VariantAttributeValue[]
  stockStatus: StockStatus
}

export type CatalogProduct = {
  id: string
  slug: string
  name: string
  brand: string | null
  /** Stored public slug; never derived from a display name. */
  brandSlug?: string | null
  category: { id: string; name: string; slug: string } | null
  image: string
  /** Ordered ready media gallery for the product detail page (contract union). */
  media: PublicProductMedia[]
  /** Sellable choices. List projections omit these; detail projections populate them. */
  variants: CatalogVariant[]
  description: string | null
  /** Lowest active-variant sale price, in IRR (Rial). */
  price: Money
  /** False when the public API omitted a sellable price; zero must not impersonate it. */
  priceAvailable?: boolean
  oldPrice: Money | null
  rating: number | null
  reviews: number
  stockStatus: StockStatus
  badge: string | null
}

export type CatalogQuery = {
  signal?: AbortSignal
  page?: number
  minPrice?: string
  maxPrice?: string
  available?: boolean
  discounted?: boolean
  slugs?: string[]
  ids?: string[]
  attributes?: Record<string, string>
  search?: string
  categoryId?: string
  categorySlug?: string
  brand?: string
  sortBy?: 'popular' | 'price_asc' | 'price_desc' | 'relevance' | 'newest'
  /** Bound small curated homepage collections without fetching a full catalog page. */
  perPage?: number
}

/** Categories exposed to the storefront browsing UI. */
export type CatalogCategory = {
  id: string
  parentId: string | null
  name: string
  slug: string
  productCount: number
  image: string
  imageAlt?: string | null
  shopOrder?: number
  shopFeatured?: boolean
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
export type CatalogSuggestions = CatalogListResult & { facets: { categories: import('@iranyaragh/contracts').SearchFacet[]; brands: import('@iranyaragh/contracts').SearchFacet[] }; correctedQuery: string | null }

export interface CatalogApi {
  popularSearches?(signal: AbortSignal): Promise<string[]>
  recordSearchClick?(query: string, productId: string): Promise<void>
  suggest?(query: string, signal: AbortSignal): Promise<CatalogSuggestions>
  listCategories(): Promise<CatalogCategory[]>
  getHomepageCollections(): Promise<HomepageCollectionsConfig>
  /** Live admin-managed banners; absent in adapters that have no banner source. */
  getHomepageBanners?(): Promise<HomepageBannerPublic[]>
  /** The separate hero slider at the top of the home page. */
  getHomepageHero?(): Promise<HomepageBannerPublic[]>
  listProducts(query?: CatalogQuery): Promise<CatalogListResult>
  getProductBySlug(slug: string): Promise<CatalogProduct>
}

export type { CategorySummary, Money }
