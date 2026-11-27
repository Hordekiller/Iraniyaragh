import type { CatalogQuery } from '../services/catalog/types'
import type { SearchParams } from './policy'
/** Null means malformed input, never silently fall back to an unfiltered listing. */
export function catalogFilters(query: SearchParams): CatalogQuery | null {
  const single = (key: string) => typeof query[key] === 'string' ? query[key] as string : undefined
  const sort = single('sort') ?? 'newest'
  if (!['newest', 'popular', 'price_asc', 'price_desc'].includes(sort)) return null
  for (const key of ['minPrice', 'maxPrice']) if (query[key] && !/^\d{1,15}$/u.test(single(key) ?? '')) return null
  if (single('minPrice') && single('maxPrice') && BigInt(single('minPrice')!) > BigInt(single('maxPrice')!)) return null
  for (const key of ['available', 'discounted']) if (query[key] && single(key) !== 'true') return null
  const ids = single('ids')?.split(',')
  if (ids && (ids.length > 24 || ids.some(id => !/^[A-Za-z0-9_-]{1,128}$/u.test(id)))) return null
  const attributes: Record<string, string> = {}
  for (const key of Object.keys(query).filter(key => key.startsWith('attr.'))) {
    const code = key.slice(5), value = single(key)
    if (value === '') continue
    if (!/^[a-z0-9-]{1,40}$/u.test(code) || !value || !/^[a-z0-9-]{1,40}$/u.test(value)) return null
    attributes[code] = value
  }
  if (Object.keys(attributes).length > 8) return null
  return { sortBy: sort as CatalogQuery['sortBy'], minPrice: single('minPrice'), maxPrice: single('maxPrice'), available: single('available') === 'true', discounted: single('discounted') === 'true', brand: single('brand'), categoryId: single('categoryId'), ids, attributes }
}
export function listingHref(path: string, query: SearchParams, page: number) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) if (key !== 'page' && typeof value === 'string' && value) params.set(key, value)
  if (page > 1) params.set('page', String(page))
  return `${path}${params.size ? `?${params}` : ''}`
}
