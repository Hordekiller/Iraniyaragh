import 'server-only'
import { cache } from 'react'
import { headers } from 'next/headers'
import { diagnosticId, createDiagnosticId } from '@iranyaragh/contracts'
import { notFound, permanentRedirect } from 'next/navigation'
import type { BrandListResponse } from '@iranyaragh/contracts'
import { CatalogFixtureClient } from '../services/catalog/fixtures'
import { fixtureAllProducts } from '../services/catalog/fixture-data'
import type { CatalogApi } from '../services/catalog/types'
import { CatalogHttpClient } from '../services/catalog/http'
import { CatalogError } from '../services/catalog/errors'
import { entityPath, validSlug } from './policy'

function apiOrigin() {
  const url = new URL(process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:4000')
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('API_INTERNAL_URL must be an HTTP origin')
  return url.origin
}
/** Public requests never forward cookies, session tokens or identity. No stale commerce HTML is cached. */
const publicFetch: typeof fetch = async (input, init) => {
  const incoming = await headers()
  const outgoing = new Headers(init?.headers)
  outgoing.set('X-Request-ID', diagnosticId(incoming.get('x-request-id')) ?? createDiagnosticId())
  return fetch(input, { ...init, headers: outgoing, cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(8_000) })
}
function isolatedFixture() { return process.env.APP_ENVIRONMENT === 'test' && process.env.NEXT_PUBLIC_FIXTURE_CATALOG === 'true' }
export function catalogApi(): CatalogApi { return isolatedFixture() ? new CatalogFixtureClient({ delayMs: 0 }) : new CatalogHttpClient({ baseUrl: apiOrigin(), fetch: publicFetch }) }
export const categories = cache(() => catalogApi().listCategories())
export const brands = cache(async () => isolatedFixture() ? [...new Set(fixtureAllProducts.map(item => item.brand).filter((name): name is string => !!name))].map(name => ({ id: name, name, slug: name.toLowerCase() })) : (await publicJson<BrandListResponse>('/api/v1/catalog/brands')).data.items)
export const products = cache(async (query: Parameters<ReturnType<typeof catalogApi>['listProducts']>[0]) => catalogApi().listProducts(query))
export const product = cache(async (slug: string) => {
  if (!validSlug(slug)) notFound()
  try {
    const value = await catalogApi().getProductBySlug(slug)
    if (!validSlug(value.slug)) notFound()
    if (value.slug !== slug) permanentRedirect(entityPath('products', value.slug))
    return value
  } catch (error) {
    if (error instanceof CatalogError && error.statusCode === 404) notFound()
    throw error
  }
})
export async function publicJson<T>(path: string): Promise<T> {
  const response = await publicFetch(`${apiOrigin()}${path}`, { headers: { Accept: 'application/json' } })
  if (response.status === 404) notFound()
  if (!response.ok) throw new Error('Public catalog unavailable')
  return response.json() as Promise<T>
}
export const eligibility = cache(async (kind: 'products' | 'categories' | 'brands', slug: string) => {
  if (!validSlug(slug)) notFound()
  if (isolatedFixture()) return false
  const result = await publicJson<{ data: { indexable: boolean; canonicalPath: string } }>(`/api/v1/discovery/catalog/${kind}/${encodeURIComponent(slug)}`)
  if (result.data.canonicalPath !== entityPath(kind, slug)) throw new Error('Public canonical projection mismatch')
  return result.data.indexable
})
export const homeCatalog = cache(async () => {
  const api = catalogApi()
  const [allCategories, settings] = await Promise.all([categories(), api.getHomepageCollections()])
  const collections = await Promise.all(settings.sections.map(async section => {
    const category = allCategories.find(item => item.id === section.categoryId)
    if (!category) return null
    const result = await api.listProducts({ categoryId: category.id, sortBy: section.sortBy === 'BESTSELLING' ? 'popular' : 'newest', perPage: 8 })
    return { category, sortBy: section.sortBy, products: result.items }
  }))
  return { categories: allCategories.filter(item => item.parentId === null), categoryCollections: collections.filter(item => item !== null) }
})
