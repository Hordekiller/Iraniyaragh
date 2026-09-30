import { API_ERROR_CODES } from '@iranyaragh/contracts'
import type {
  ApiErrorCode,
  BrandListResponse,
  CategoryListResponse,
  ProductDetailPublicResponse,
  ProductListResponse,
  ProductVariantPublic,
  PublicProductMediaImage,
} from '@iranyaragh/contracts'
import type { PublicAvailabilityResponse } from '@iranyaragh/contracts'
import { CatalogError } from './errors'
import { LISTING_MAX_PER_PAGE, LISTING_PER_PAGE } from './types'
import type { CatalogApi, CatalogBrand, CatalogCategory, CatalogListResult, CatalogProduct, CatalogQuery } from './types'

type HttpClientOptions = { baseUrl?: string; fetch?: typeof globalThis.fetch }

const PLACEHOLDER_IMAGE = '/images/tool1.jpg'

/** Best-effort human label for a public variant (its title, or axis option labels). */
function variantTitleLabel(variant: ProductVariantPublic): string | null {
  const title = variant.title?.trim()
  if (title) return title
  const labels = (variant.attributeValues ?? [])
    .filter(value => value.isVariantAxis)
    .map(value => value.optionLabel)
    .filter(Boolean)
  return labels.length > 0 ? labels.join('، ') : null
}

/** Public catalog adapter. It never fabricates price or availability data. */
export class CatalogHttpClient implements CatalogApi {
  private readonly baseUrl: string
  private readonly fetcher: typeof globalThis.fetch
  private categoriesPromise?: Promise<CatalogCategory[]>
  private brandsPromise?: Promise<Array<{ id: string; name: string; slug: string }>>

  constructor(options: HttpClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? ''
    // `fetch` must be bound to its global. Calling it as `this.fetcher(...)` would
    // pass the client as the receiver, and browsers reject that with
    // `TypeError: Illegal invocation` before any request is sent. Node and jsdom
    // accept it, so only a real browser surfaces the failure.
    this.fetcher = options.fetch ?? globalThis.fetch.bind(globalThis)
  }

  async listCategories(): Promise<CatalogCategory[]> {
    this.categoriesPromise ??= this.request<CategoryListResponse>('/api/v1/catalog/categories')
      .then(response => response.data.items.map(category => ({
        id: category.id,
        name: category.name,
        slug: category.slug,
        parentId: category.parentId,
        productCount: category.productCount,
        image: PLACEHOLDER_IMAGE,
      })))
    return this.categoriesPromise
  }

  async listProducts(query: CatalogQuery = {}): Promise<CatalogListResult> {
    const page = Math.max(1, Math.trunc(query.page ?? 1))
    const perPage = Math.min(Math.max(1, Math.trunc(query.perPage ?? LISTING_PER_PAGE)), LISTING_MAX_PER_PAGE)
    const params = new URLSearchParams({ page: String(page), perPage: String(perPage) })
    if (query.search?.trim()) params.set('search', query.search.trim())
    if (query.categorySlug) {
      const category = (await this.listCategories()).find(item => item.slug === query.categorySlug)
      if (!category) return { items: [], meta: { page, perPage, total: 0, pages: 0 } }
      params.set('categoryId', category.id)
    }
    if (query.brand) {
      const brand = (await this.listBrandsInternal()).find(item => item.slug === query.brand || item.name === query.brand)
      if (!brand) return { items: [], meta: { page, perPage, total: 0, pages: 0 } }
      params.set('brandId', brand.id)
    }
    if (query.sortBy === 'newest') {
      params.set('sortBy', 'createdAt')
      params.set('sortDir', 'desc')
    } else if (query.sortBy === 'name' || query.sortBy === 'name_desc') {
      params.set('sortBy', 'name')
      params.set('sortDir', query.sortBy === 'name' ? 'asc' : 'desc')
    }
    const response = await this.request<ProductListResponse>(`/api/v1/catalog/products?${params}`)
    return { items: response.data.items.map(item => this.mapProduct(item)), meta: response.data.meta }
  }

  async getProductBySlug(slug: string): Promise<CatalogProduct> {
    const response = await this.request<ProductDetailPublicResponse>(`/api/v1/catalog/products/${encodeURIComponent(slug)}`)
    const product = response.data.product
    const availability = await this.requestFlat<PublicAvailabilityResponse>(`/api/v1/inventory/public/availability?variantIds=${product.variants.map(variant => encodeURIComponent(variant.id)).join(',')}`)
    const statusByVariant = new Map(availability.items.map(item => [item.variantId, item.status]))
    const statuses = [...statusByVariant.values()]
    const stockStatus = statuses.includes('IN_STOCK') ? 'IN_STOCK' : statuses.includes('LOW_STOCK') ? 'LOW_STOCK' : statuses.length > 0 && statuses.every(status => status === 'OUT_OF_STOCK') ? 'OUT_OF_STOCK' : 'UNKNOWN'
    return { ...this.mapProduct(product, statusByVariant), stockStatus }
  }

  async listBrands(): Promise<CatalogBrand[]> {
    return this.listBrandsInternal()
  }

  private async listBrandsInternal() {
    this.brandsPromise ??= this.request<BrandListResponse>('/api/v1/catalog/brands')
      .then(response => response.data.items.map(brand => ({ id: brand.id, name: brand.name, slug: brand.slug })))
    return this.brandsPromise
  }

  private mapProduct(
    product: ProductListResponse['data']['items'][number] | ProductDetailPublicResponse['data']['product'],
    availabilityByVariant?: Map<string, PublicAvailabilityResponse['items'][number]['status']>,
  ): CatalogProduct {
    const detail = 'variants' in product ? product : null
    let primary: PublicProductMediaImage | undefined = product.primaryMedia ?? undefined
    if (!primary && detail) {
      const media = detail.media.find(item => item.kind === 'IMAGE' && item.role === 'PRIMARY')
        ?? detail.media.find(item => item.kind === 'IMAGE')
      if (media?.kind === 'IMAGE') primary = media
    }
    const variantPrice = detail?.variants.find(variant => variant.isActive)?.salePrice
    const activeVariants = detail?.variants.filter(variant => variant.isActive) ?? []
    const variants = activeVariants.map(variant => {
      const status = availabilityByVariant?.get(variant.id)
      return {
        id: variant.id,
        sku: variant.sku,
        title: variantTitleLabel(variant),
        salePrice: variant.salePrice,
        weightGrams: variant.weightGrams ?? null,
        available: status === 'IN_STOCK' || status === 'LOW_STOCK',
        lowStock: status === 'LOW_STOCK',
      }
    })
    return {
      id: product.id,
      slug: product.slug,
      name: product.name,
      brand: detail?.brand?.name ?? null,
      category: detail?.category
        ? { id: detail.category.id, name: detail.category.name, slug: detail.category.slug, parentId: detail.category.parentId }
        : null,
      image: primary?.sources[0]?.url ?? PLACEHOLDER_IMAGE,
      media: detail?.media ?? [],
      description: detail?.description ?? null,
      price: product.startingPrice ?? variantPrice ?? { amount: '0', currency: 'IRR' },
      oldPrice: null,
      rating: null,
      reviews: 0,
      stockStatus: 'UNKNOWN',
      badge: null,
      variants,
      defaultVariantId: variants.find(variant => variant.available)?.id ?? variants[0]?.id ?? null,
    }
  }

  private async request<T extends { data: unknown }>(path: string): Promise<T> {
    let response: Response
    try {
      response = await this.fetcher(`${this.baseUrl}${path}`, { headers: { Accept: 'application/json' } })
    } catch {
      throw new CatalogError({ code: 'UPSTREAM_UNAVAILABLE', message: 'ارتباط با کاتالوگ برقرار نشد.' })
    }
    const body = await response.json().catch(() => null) as Record<string, unknown> | null
    if (!response.ok) {
      const error = body && typeof body.code === 'string' ? body : {}
      const code = typeof error.code === 'string' && (API_ERROR_CODES as readonly string[]).includes(error.code)
        ? error.code as ApiErrorCode
        : 'INTERNAL_ERROR'
      throw new CatalogError({ code, message: typeof error.message === 'string' ? error.message : 'دریافت اطلاعات کاتالوگ ناموفق بود.', statusCode: response.status, requestId: typeof error.requestId === 'string' ? error.requestId : undefined, details: error.details })
    }
    if (!body || !('data' in body)) throw new CatalogError({ code: 'INTERNAL_ERROR', message: 'پاسخ کاتالوگ معتبر نیست.', statusCode: response.status })
    return body as T
  }

  private async requestFlat<T extends object>(path: string): Promise<T> {
    let response: Response
    try { response = await this.fetcher(`${this.baseUrl}${path}`, { headers: { Accept: 'application/json' } }) }
    catch { throw new CatalogError({ code: 'UPSTREAM_UNAVAILABLE', message: 'ارتباط با موجودی برقرار نشد.' }) }
    const body = await response.json().catch(() => null) as T | null
    if (!response.ok) throw new CatalogError({ code: 'INTERNAL_ERROR', message: 'دریافت موجودی ناموفق بود.', statusCode: response.status })
    if (!body || !Array.isArray((body as { items?: unknown }).items)) throw new CatalogError({ code: 'INTERNAL_ERROR', message: 'پاسخ موجودی معتبر نیست.', statusCode: response.status })
    return body
  }
}
