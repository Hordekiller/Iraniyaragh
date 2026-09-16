import { describe, expect, it, vi } from 'vitest'
import { CatalogError } from './errors'
import { CatalogHttpClient } from './http'

const image = { id: 'media-1', kind: 'IMAGE' as const, position: 0, role: 'PRIMARY' as const, alt: 'دریل', caption: null, width: 640, height: 640, sources: [{ url: '/media/products/p.webp', width: 640, height: 640, type: 'image/webp' }] }

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

describe('CatalogHttpClient', () => {
  it('maps live public list data and resolves category filters', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/categories')) return response({ data: { items: [{ id: 'cat-1', name: 'ابزار', slug: 'tools', productCount: 2 }] } })
      if (url.includes('/products?')) return response({ data: { items: [{ id: 'p-1', name: 'دریل', slug: 'drill', status: 'PUBLISHED', brandId: null, categoryId: 'cat-1', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', primaryMedia: image, startingPrice: { amount: '1250000', currency: 'IRR' } }], meta: { page: 1, perPage: 100, total: 1, pages: 1 } } })
      throw new Error(`unexpected request: ${url}`)
    })
    const result = await new CatalogHttpClient({ baseUrl: '/backend', fetch: fetcher }).listProducts({ categorySlug: 'tools' })
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(result.items[0]).toMatchObject({ id: 'p-1', price: { amount: '1250000', currency: 'IRR' }, image: image.sources[0].url, stockStatus: 'UNKNOWN' })
    expect(String(fetcher.mock.calls[1]?.[0])).toContain('categoryId=cat-1')
  })

  it('maps detail primary media and active variant price', async () => {
    const fetcher = vi.fn(async () => response({ data: { product: { id: 'p-1', name: 'دریل', slug: 'drill', status: 'PUBLISHED', brandId: null, categoryId: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', description: 'توضیح', brand: null, category: null, variants: [{ id: 'v-1', isActive: true, salePrice: { amount: '990000', currency: 'IRR' } }], media: [image] } } }))
    const product = await new CatalogHttpClient({ fetch: fetcher }).getProductBySlug('drill/blue')
    expect(fetcher).toHaveBeenCalledWith('/api/v1/catalog/products/drill%2Fblue', expect.anything())
    expect(product).toMatchObject({ price: { amount: '990000' }, description: 'توضیح', image: image.sources[0].url })
  })

  it('normalizes transport, API and malformed responses', async () => {
    await expect(new CatalogHttpClient({ fetch: vi.fn(async () => { throw new Error('offline') }) }).listCategories()).rejects.toMatchObject({ code: 'UPSTREAM_UNAVAILABLE' })
    await expect(new CatalogHttpClient({ fetch: vi.fn(async () => response({ code: 'NOT_FOUND', message: 'missing', requestId: 'req-1' }, 404)) }).listCategories()).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404, requestId: 'req-1' })
    const error = new CatalogHttpClient({ fetch: vi.fn(async () => response({ nope: true })) })
    await expect(error.listCategories()).rejects.toBeInstanceOf(CatalogError)
  })
})
