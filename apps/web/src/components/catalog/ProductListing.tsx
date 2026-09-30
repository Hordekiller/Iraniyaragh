import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { RotateCcw } from 'lucide-react'
import { ProductGrid } from '../product/ProductGrid'
import { BrandFilter, ProductSortSelect } from './ProductFilters'
import { Pagination } from './Pagination'
import { useCatalogApi } from '../../state/catalog-context'
import { toPersianDigits } from '../../lib/format'
import { ROUTES } from '../../lib/routes'
import { useListingParams } from '../../lib/use-listing-params'
import { LISTING_PER_PAGE } from '../../services/catalog/types'
import type { CatalogBrand, CatalogListResult, CatalogSort } from '../../services/catalog/types'

export type ListingCrumb = { label: string; to?: string }

type ListingRequest = { categorySlug?: string; search?: string; brand?: string; sort: CatalogSort; page: number }

/** Stable identity for a listing request, safe to use as an effect dependency. */
function requestKey(request: ListingRequest): string {
  return [request.categorySlug ?? '', request.search ?? '', request.brand ?? '', request.sort, request.page].join('|')
}

/**
 * Shared product-listing surface for the catalog, newest, category and search
 * pages.
 *
 * Every value it shows comes from the live catalog: the result count is the API's
 * own `meta.total` (not the length of the page we happened to receive), the page
 * buttons are driven by `meta.pages`, and the brand filter is built from the
 * brands the API returns. Loading, empty and error are distinct, honest states
 * rather than a silent blank grid, and sort/brand/page live in the URL so a
 * filtered listing is a shareable link that survives back/forward.
 */
export function ProductListing({
  title,
  subtitle,
  crumbs,
  defaultSort,
  categorySlug,
  search,
  emptyMessage,
  sortId = 'listing-sort',
  brandId = 'listing-brand',
}: {
  title: string
  subtitle?: string | null
  crumbs: ListingCrumb[]
  defaultSort: CatalogSort
  categorySlug?: string
  search?: string
  emptyMessage: string
  sortId?: string
  brandId?: string
}) {
  const api = useCatalogApi()
  const { sort, brand, page, setSort, setBrand, setPage } = useListingParams(defaultSort)
  const [brands, setBrands] = useState<CatalogBrand[]>([])
  // Results are tagged with the request that produced them, so a filter change
  // renders the loading state by comparison rather than by a synchronous reset.
  const [results, setResults] = useState<{ key: string; value: CatalogListResult } | null>(null)
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  // The error copy always asked the customer to try again without giving them a
  // way to, so the retry is a real re-request rather than a page reload.
  const retry = useCallback(() => setReloadToken(current => current + 1), [])

  const key = requestKey({ categorySlug, search, brand: brand ?? undefined, sort, page })

  useEffect(() => {
    let cancelled = false
    api
      .listBrands()
      .then(list => {
        if (!cancelled) setBrands(list)
      })
      .catch(() => {
        // A failed brand lookup only removes the filter control; the listing itself
        // stays usable, so this is not surfaced as a page-level error.
        if (!cancelled) setBrands([])
      })
    return () => {
      cancelled = true
    }
  }, [api])

  useEffect(() => {
    let cancelled = false
    api
      .listProducts({ categorySlug, search, brand: brand ?? undefined, sortBy: sort, page, perPage: LISTING_PER_PAGE })
      .then(value => {
        if (!cancelled) setResults({ key, value })
      })
      .catch(() => {
        if (cancelled) return
        setResults(null)
        setFailure({ key, message: 'بارگذاری محصولات با خطا مواجه شد. لطفاً دوباره تلاش کنید.' })
      })
    return () => {
      cancelled = true
    }
  }, [api, categorySlug, search, brand, sort, page, key, reloadToken])

  const settled = results?.key === key ? results.value : null
  const error = failure?.key === key ? failure.message : null
  const loading = !settled && !error
  // The last successfully loaded page, so paging survives a filter or page change
  // without a layout jump; never used to invent numbers the API did not return.
  const previous = results?.value ?? null
  const items = settled?.items ?? null
  const total = settled?.meta.total ?? null
  const filtered = Boolean(brand) || sort !== defaultSort

  function clearFilters() {
    setBrand(null)
    setSort(defaultSort)
  }

  // A URL can point past the end of the result set (`?page=999`, or a page that
  // existed before the catalogue shrank). The API answers that with an empty
  // page, which would leave the customer on a dead end with no way back, so the
  // offset is corrected to the last real page once the metadata arrives.
  const outOfRange = Boolean(settled) && page > 1 && items !== null && items.length === 0
  useEffect(() => {
    if (!outOfRange || !settled) return
    const lastPage = Math.max(1, settled.meta.pages)
    setPage(Math.min(page, lastPage))
  }, [outOfRange, settled, page, setPage])

  return (
    <>
      <nav aria-label="مسیر صفحه" className="text-xs text-slate-500 mb-3">
        <Link to={ROUTES.home} className="hover:text-[#FF4D00]">خانه</Link>
        {crumbs.map(crumb => (
          <span key={crumb.label}>
            <span className="mx-1">/</span>
            {crumb.to ? (
              <Link to={crumb.to} className="hover:text-[#FF4D00]">{crumb.label}</Link>
            ) : (
              <span className="text-slate-600 font-bold">{crumb.label}</span>
            )}
          </span>
        ))}
      </nav>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-black text-slate-900 text-lg lg:text-2xl">{title}</h1>
          {subtitle ? <p className="mt-1 text-xs text-slate-500">{subtitle}</p> : null}
        </div>
        {/* Wraps under the title on narrow screens instead of forcing a scrollbar. */}
        <div className="flex flex-wrap items-center gap-3">
          <BrandFilter id={brandId} brands={brands} selected={brand} onChange={setBrand} />
          <ProductSortSelect id={sortId} value={sort} onChange={setSort} />
        </div>
      </div>

      {total !== null && (
        <p className="mt-3 text-xs text-slate-500">
          {toPersianDigits(total)} کالا
          {filtered ? ' (با فیلتر فعلی)' : ''}
        </p>
      )}

      {loading && (
        <p className="mt-8 text-slate-500" role="status">در حال بارگذاری محصولات...</p>
      )}

      {error && (
        <div role="alert" className="mt-8 rounded-2xl bg-red-50 border border-red-200 p-4">
          <p className="text-red-700 text-sm font-bold">{error}</p>
          <button
            type="button"
            onClick={retry}
            className="mt-3 inline-flex items-center gap-2 h-9 px-4 rounded-full bg-white border border-red-200 text-red-700 text-xs font-black hover:border-red-400 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-700 focus-visible:ring-offset-2"
          >
            <RotateCcw size={14} aria-hidden="true" />
            تلاش دوباره
          </button>
        </div>
      )}

      {items !== null && items.length === 0 && !error && (
        <div className="mt-8 rounded-2xl border border-slate-100 bg-white p-6 text-center">
          <p className="text-slate-600 text-sm">{emptyMessage}</p>
          {filtered && (
            <button
              type="button"
              onClick={clearFilters}
              className="mt-3 text-xs font-bold text-[#C2410C] hover:underline"
            >
              حذف فیلترها
            </button>
          )}
        </div>
      )}

      {items !== null && items.length > 0 && (
        <div className="mt-5">
          <ProductGrid products={items} />
        </div>
      )}

      {/* Pagination stays mounted across a page change so the layout does not jump
          and the control keeps its position; it is disabled and announced busy
          until the next page of live metadata arrives. */}
      {previous && (items === null || items.length > 0) && (
        <Pagination
          page={settled?.meta.page ?? previous.meta.page}
          pages={settled?.meta.pages ?? previous.meta.pages}
          total={settled?.meta.total ?? previous.meta.total}
          perPage={settled?.meta.perPage ?? previous.meta.perPage}
          busy={loading}
          onChange={setPage}
        />
      )}
    </>
  )
}
