import { API_ERROR_CODES } from '@iranyaragh/contracts'
import type {
  SearchResponse,
  ApiErrorCode,
  BrandListResponse,
  CategoryListResponse,
  ProductDetailPublicResponse,
  ProductListResponse,
  HomepageCollectionsResponse,
  HomepageBannersPublicResponse,
  PublicProductMediaImage,
  ReviewSummariesResponse,
} from '@iranyaragh/contracts'
import type { PublicAvailabilityResponse } from '@iranyaragh/contracts'
import { CatalogError } from './errors'
import type {
  CatalogApi,
  CatalogCategory,
  CatalogListResult,
  CatalogProduct,
  CatalogQuery,
} from './types'

type HttpClientOptions = { baseUrl?: string; fetch?: typeof globalThis.fetch }

const PLACEHOLDER_IMAGE = '/images/tool1.jpg'

/** Public catalog adapter. It never fabricates price or availability data. */
export class CatalogHttpClient implements CatalogApi {
  private readonly baseUrl: string
  private readonly fetcher: typeof globalThis.fetch
  private categoriesPromise?: Promise<CatalogCategory[]>
  private brandsPromise?: Promise<
    Array<{ id: string; name: string; slug: string }>
  >

  constructor(options: HttpClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? ''
    // Browser Window.fetch requires its native receiver; calling an extracted
    // function as this.fetcher() otherwise fails with "Illegal invocation".
    this.fetcher = options.fetch ?? globalThis.fetch.bind(globalThis)
  }

  async listCategories(): Promise<CatalogCategory[]> {
    this.categoriesPromise ??= this.request<CategoryListResponse>(
      '/api/v1/catalog/categories',
    )
      .then((response) =>
        response.data.items.map((category) => ({
          id: category.id,
          parentId: category.parentId,
          name: category.name,
          slug: category.slug,
          productCount: category.productCount,
          image: category.image?.url ?? '',
          imageAlt: category.imageAlt, shopOrder: category.shopOrder, shopFeatured: category.shopFeatured,
        })),
      )
      .finally(() => {
        // Coalesce in-flight reads only; later visits must see catalog changes.
        this.categoriesPromise = undefined
      })
    return this.categoriesPromise
  }

  async getHomepageCollections() {
    const response = await this.request<HomepageCollectionsResponse>('/api/v1/catalog/homepage-collections')
    return response.data.config
  }

  async getHomepageBanners() {
    const response = await this.request<HomepageBannersPublicResponse>('/api/v1/catalog/homepage-banners')
    return response.data.banners
  }

  async getHomepageHero() {
    const response = await this.request<HomepageBannersPublicResponse>('/api/v1/catalog/homepage-hero')
    return response.data.banners
  }

  async popularSearches(signal: AbortSignal) {
    return (await this.request<{ data: { queries: string[] } }>('/api/v1/search/popular', signal)).data.queries
  }
  async recordSearchClick(query: string, productId: string) {
    await this.fetcher(`${this.baseUrl}/api/v1/search/click`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ q: query, productId }), keepalive: true })
  }

  async suggest(query: string, signal: AbortSignal) {
    const response = await this.request<SearchResponse>(`/api/v1/search/suggest?q=${encodeURIComponent(query)}`, signal)
    return { ...response.data, items: response.data.items.map(item => this.mapProduct(item)) }
  }

  async listProducts(query: CatalogQuery = {}): Promise<CatalogListResult> {
    const perPage = Number.isInteger(query.perPage)
      ? Math.max(1, Math.min(100, query.perPage!))
      : 100
    const params = new URLSearchParams({ page: String(query.page ?? 1), perPage: String(perPage) })
    if (query.search?.trim()) params.set('q', query.search.trim())
    if (query.sortBy === 'relevance') params.set('sortBy', 'relevance')
    if (query.categoryId) {
      params.set('categoryId', query.categoryId)
    } else if (query.categorySlug) {
      const category = (await this.listCategories()).find(
        (item) => item.slug === query.categorySlug,
      )
      if (!category)
        return {
          items: [],
          meta: { page: 1, perPage: 100, total: 0, pages: 0 },
        }
      params.set('categoryId', category.id)
    }
    if (query.brand) {
      const brand = (await this.listBrands()).find(
        (item) => item.slug === query.brand || item.name === query.brand,
      )
      if (!brand)
        return {
          items: [],
          meta: { page: 1, perPage: 100, total: 0, pages: 0 },
        }
      params.set('brandId', brand.id)
    }
    if (query.sortBy === 'newest') {
      params.set('sortBy', 'createdAt')
      params.set('sortDir', 'desc')
    } else if (query.sortBy === 'popular') {
      params.set('sortBy', 'popular')
    }
    if (query.sortBy === 'price_asc' || query.sortBy === 'price_desc') { params.set('sortBy', 'price'); params.set('sortDir', query.sortBy === 'price_asc' ? 'asc' : 'desc') }
    if (query.minPrice) params.set('minPrice', query.minPrice)
    if (query.maxPrice) params.set('maxPrice', query.maxPrice)
    if (query.available) params.set('available', 'true')
    if (query.discounted) params.set('discounted', 'true')
    if (query.slugs?.length) params.set('slugs', query.slugs.join(','))
    if (query.ids?.length) params.set('ids', query.ids.join(','))
    if (query.attributes && Object.keys(query.attributes).length) params.set('attributes', JSON.stringify(query.attributes))
    const response = await this.request<ProductListResponse>(
      `/api/v1/${query.search?.trim() ? 'search/products' : 'catalog/products'}?${params}`, query.signal,
    )
    const items = response.data.items.map((item) => this.mapProduct(item))
    return { items: await this.withRatings(items), meta: response.data.meta }
  }

  /**
   * Attach approved-review aggregates to listing cards. Best effort and never fabricated: if the
   * reviews service is unavailable the cards simply show no rating.
   */
  private async withRatings(items: CatalogProduct[]): Promise<CatalogProduct[]> {
    if (items.length === 0) return items
    try {
      const response = await this.fetcher(
        `${this.baseUrl}/api/v1/reviews/summaries?ids=${items.map((item) => encodeURIComponent(item.id)).join(',')}`,
        { headers: { Accept: 'application/json' } },
      )
      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined)
        return items
      }
      const body = (await response.json()) as Partial<ReviewSummariesResponse>
      const rows = body.data?.items
      if (!Array.isArray(rows)) return items
      const byId = new Map(rows.map((row) => [row.productId, row]))
      return items.map((item) => {
        const row = byId.get(item.id)
        return row && row.count > 0 ? { ...item, rating: row.average, reviews: row.count } : item
      })
    } catch {
      return items
    }
  }

  async getProductBySlug(slug: string): Promise<CatalogProduct> {
    const response = await this.request<ProductDetailPublicResponse>(
      `/api/v1/catalog/products/${encodeURIComponent(slug)}`,
    )
    const product = response.data.product
    const activeVariants = product.variants.filter(variant => variant.isActive)
    const availability = activeVariants.length ? await this.requestFlat<PublicAvailabilityResponse>(
      `/api/v1/inventory/public/availability?variantIds=${activeVariants.map((variant) => encodeURIComponent(variant.id)).join(',')}`,
    ) : { items: [] }
    const availabilityByVariant = new Map(
      availability.items.map((item) => [item.variantId, item.status]),
    )
    const variants = product.variants
      .filter((variant) => variant.isActive)
      .map((variant) => ({
        id: variant.id,
        sku: variant.sku,
        title: variant.title ?? null,
        price: variant.salePrice,
        attributes: variant.attributeValues ?? [],
        stockStatus:
          availabilityByVariant.get(variant.id) ?? ('UNKNOWN' as const),
      }))
    const statuses = variants.map((item) => item.stockStatus)
    const stockStatus = statuses.includes('IN_STOCK')
      ? 'IN_STOCK'
      : statuses.includes('LOW_STOCK')
        ? 'LOW_STOCK'
        : statuses.length > 0 &&
            statuses.every((status) => status === 'OUT_OF_STOCK')
          ? 'OUT_OF_STOCK'
          : 'UNKNOWN'
    return { ...this.mapProduct(product), brandSlug: product.brand?.slug ?? null, variants, stockStatus }
  }

  private async listBrands() {
    this.brandsPromise ??= this.request<BrandListResponse>(
      '/api/v1/catalog/brands',
    ).then((response) =>
      response.data.items.map((brand) => ({
        id: brand.id,
        name: brand.name,
        slug: brand.slug,
      })),
    ).finally(() => { this.brandsPromise = undefined })
    return this.brandsPromise
  }

  private mapProduct(
    product:
      | ProductListResponse['data']['items'][number]
      | ProductDetailPublicResponse['data']['product'],
  ): CatalogProduct {
    const detail = 'variants' in product ? product : null
    let primary: PublicProductMediaImage | undefined =
      product.primaryMedia ?? undefined
    if (!primary && detail) {
      const media =
        detail.media.find(
          (item) => item.kind === 'IMAGE' && item.role === 'PRIMARY',
        ) ?? detail.media.find((item) => item.kind === 'IMAGE')
      if (media?.kind === 'IMAGE') primary = media
    }
    const variantPrice = detail?.variants.find(
      (variant) => variant.isActive,
    )?.salePrice
    return {
      id: product.id,
      slug: product.slug,
      name: product.name,
      brand: detail?.brand?.name ?? null,
      category: detail?.category
        ? {
            id: detail.category.id,
            name: detail.category.name,
            slug: detail.category.slug,
          }
        : null,
      image: primary?.sources[0]?.url ?? PLACEHOLDER_IMAGE,
      media: detail?.media ?? [],
      variants: [],
      description: detail?.description ?? null,
      price: product.startingPrice ??
        variantPrice ?? { amount: '0', currency: 'IRR' },
      priceAvailable: product.startingPrice != null || variantPrice != null,
      oldPrice: 'previousPrice' in product ? product.previousPrice ?? null : null,
      rating: null,
      reviews: 0,
      stockStatus: product.stockStatus ?? 'UNKNOWN',
      badge: null,
    }
  }

  private async request<T extends { data: unknown }>(path: string, signal?: AbortSignal): Promise<T> {
    let response: Response
    try {
      response = await this.fetcher(`${this.baseUrl}${path}`, {
        headers: { Accept: 'application/json' }, signal,
      })
    } catch {
      throw new CatalogError({
        code: 'UPSTREAM_UNAVAILABLE',
        message: 'ارتباط با کاتالوگ برقرار نشد.',
      })
    }
    const body = (await response.json().catch(() => null)) as Record<
      string,
      unknown
    > | null
    if (!response.ok) {
      const error = body && typeof body.code === 'string' ? body : {}
      const code =
        typeof error.code === 'string' &&
        (API_ERROR_CODES as readonly string[]).includes(error.code)
          ? (error.code as ApiErrorCode)
          : 'INTERNAL_ERROR'
      throw new CatalogError({
        code,
        message:
          typeof error.message === 'string'
            ? error.message
            : 'دریافت اطلاعات کاتالوگ ناموفق بود.',
        statusCode: response.status,
        requestId:
          typeof error.requestId === 'string' ? error.requestId : undefined,
        details: error.details,
      })
    }
    if (!body || !('data' in body))
      throw new CatalogError({
        code: 'INTERNAL_ERROR',
        message: 'پاسخ کاتالوگ معتبر نیست.',
        statusCode: response.status,
      })
    return body as T
  }

  private async requestFlat<T extends object>(path: string): Promise<T> {
    let response: Response
    try {
      response = await this.fetcher(`${this.baseUrl}${path}`, {
        headers: { Accept: 'application/json' },
      })
    } catch {
      throw new CatalogError({
        code: 'UPSTREAM_UNAVAILABLE',
        message: 'ارتباط با موجودی برقرار نشد.',
      })
    }
    const body = (await response.json().catch(() => null)) as T | null
    if (!response.ok)
      throw new CatalogError({
        code: 'INTERNAL_ERROR',
        message: 'دریافت موجودی ناموفق بود.',
        statusCode: response.status,
      })
    if (!body || !Array.isArray((body as { items?: unknown }).items))
      throw new CatalogError({
        code: 'INTERNAL_ERROR',
        message: 'پاسخ موجودی معتبر نیست.',
        statusCode: response.status,
      })
    return body
  }
}
