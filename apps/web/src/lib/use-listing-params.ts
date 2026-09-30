import { useSearchParams } from 'react-router-dom'
import { useCallback } from 'react'
import type { CatalogSort } from '../services/catalog/types'

export const CATALOG_SORTS: readonly CatalogSort[] = ['newest', 'name', 'name_desc']

function isSort(value: string | null): value is CatalogSort {
  return value !== null && (CATALOG_SORTS as readonly string[]).includes(value)
}

/**
 * Listing filter state kept in the URL.
 *
 * Sort order and brand live in the query string so a filtered listing is a
 * shareable, back/forward-safe link instead of hidden component state.
 */
export function useListingParams(defaultSort: CatalogSort) {
  const [params, setParams] = useSearchParams()
  const rawSort = params.get('sort')
  const sort: CatalogSort = isSort(rawSort) ? rawSort : defaultSort
  const brand = params.get('brand')?.trim() || null
  const rawPage = Number(params.get('page'))
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1

  const update = useCallback(
    (changes: { sort?: CatalogSort | null; brand?: string | null; page?: number | null }) => {
      setParams(
        previous => {
          const next = new URLSearchParams(previous)
          if (changes.sort !== undefined) {
            if (changes.sort === null || changes.sort === defaultSort) next.delete('sort')
            else next.set('sort', changes.sort)
          }
          if (changes.brand !== undefined) {
            if (changes.brand === null) next.delete('brand')
            else next.set('brand', changes.brand)
          }
          if (changes.page !== undefined) {
            if (changes.page === null || changes.page === 1) next.delete('page')
            else next.set('page', String(changes.page))
          }
          return next
        },
        { replace: true },
      )
    },
    [setParams, defaultSort],
  )

  return {
    sort,
    brand,
    page,
    // Any filter change invalidates the current page offset, so it resets to the
    // first page instead of stranding the user on an out-of-range result.
    setSort: useCallback((value: CatalogSort) => update({ sort: value, page: null }), [update]),
    setBrand: useCallback((value: string | null) => update({ brand: value, page: null }), [update]),
    setPage: useCallback((value: number) => update({ page: value }), [update]),
  }
}
