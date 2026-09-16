import { API_ERROR_CODES } from '@iranyaragh/contracts'
import type {
  ApiErrorCode,
  BrandListResponse,
  CategoryListResponse,
  ProductDetailPublicResponse,
  ProductListResponse,
  PublicProductMediaImage,
} from '@iranyaragh/contracts'
import { CatalogError } from './errors'
import type { CatalogApi, CatalogCategory, CatalogListResult, CatalogProduct, CatalogQuery } from './types'

type HttpClientOptions = { baseUrl?: string; fetch?: typeof globalThis.fetch }

const PLACEHOLDER_IMAGE = '/images/tool1.jpg'

/** Public catalog adapter. It never fabricates price or availability data. */
export class CatalogHttpClient implements CatalogApi {
  private readonly baseUrl: string
  private readonly fetcher: typeof globalThis.fetch
  private categoriesPromise?: Promise<CatalogCategory[]>
  private brandsPromise?: Promise<Array<{ id: string; name: string; slug: string }>>

  constructor(options: HttpClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? ''
    this.fetcher = options.fetch ?? globalThis.fetch
  }

  async listCategories(): Promise<CatalogCategory[]> {
    this.categoriesPromise ??= this.request<CategoryListResponse>('/api/v1/catalog/categories')
      .then(response => response.data.items.map(category => ({
        id: category.id,
        name: category.name,
        slug: category.slug,
        productCount: category.productCount,
        image: PLACEHOLDER_IMAGE,
      })))
    return this.categoriesPromise
  }

  async listProducts(query: CatalogQuery = {}): Promise<CatalogListResult> {
    const params = new URLSearchParams({ page: '1', perPage: '100' })
    if (query.search?.trim()) params.set('search', query.search.trim())
    if (query.categorySlug) {
      const category = (await this.listCategories()).find(item => item.slug === query.categorySlug)
      if (!category) return { items: [], meta: { page: 1, perPage: 100, total: 0, pages: 0 } }
      params.set('categoryId', category.id)
    }
    if (query.brand) {
      const brand = (await this.listBrands()).find(item => item.slug === query.brand || item.name === query.brand)
      if (!brand) return { items: [], meta: { page: 1, perPage: 100, total: 0, pages: 0 } }
      params.set('brandId', brand.id)
    }
    if (query.sortBy === 'newest') {
      params.set('sortBy', 'createdAt')
      params.set('sortDir', 'desc')
    }
    const response = await this.request<ProductListResponse>(`/api/v1/catalog/products?${params}`)
    return { items: response.data.items.map(item => this.mapProduct(item)), meta: response.data.meta }
  }

  async getProductBySlug(slug: string): Promise<CatalogProduct> {
    const response = await this.request<ProductDetailPublicResponse>(`/api/v1/catalog/products/${encodeURIComponent(slug)}`)
    return this.mapProduct(response.data.product)
  }

  private async listBrands() {
    this.brandsPromise ??= this.request<BrandListResponse>('/api/v1/catalog/brands')
      .then(response => response.data.items.map(brand => ({ id: brand.id, name: brand.name, slug: brand.slug })))
    return this.brandsPromise
  }

  private mapProduct(product: ProductListResponse['data']['items'][number] | ProductDetailPublicResponse['data']['product']): CatalogProduct {
    const detail = 'variants' in product ? product : null
    let primary: PublicProductMediaImage | undefined = product.primaryMedia ?? undefined
    if (!primary && detail) {
      const media = detail.media.find(item => item.kind === 'IMAGE' && item.role === 'PRIMARY')
        ?? detail.media.find(item => item.kind === 'IMAGE')
      if (media?.kind === 'IMAGE') primary = media
    }
    const variantPrice = detail?.variants.find(variant => variant.isActive)?.salePrice
    return {
      id: product.id,
      slug: product.slug,
      name: product.name,
      brand: detail?.brand?.name ?? null,
      category: detail?.category ? { id: detail.category.id, name: detail.category.name, slug: detail.category.slug } : null,
      image: primary?.sources[0]?.url ?? PLACEHOLDER_IMAGE,
      description: detail?.description ?? null,
      price: product.startingPrice ?? variantPrice ?? { amount: '0', currency: 'IRR' },
      oldPrice: null,
      rating: null,
      reviews: 0,
      stockStatus: 'UNKNOWN',
      badge: null,
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
}
