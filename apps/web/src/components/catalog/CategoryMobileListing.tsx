'use client'

import { useRef, useState } from 'react'
import { ProductGrid } from '../product/ProductGrid'
import { SortBar } from './SortBar'
import { useCatalogApi } from '../../state/catalog-context'
import type { CatalogListResult, CatalogQuery, CatalogProduct } from '../../services/catalog/types'

type SortKey = NonNullable<CatalogQuery['sortBy']>

export function CategoryMobileListing({ categoryId, page, initialResult }: {
  categoryId: string
  page: number
  initialResult: CatalogListResult
}) {
  const api = useCatalogApi()
  const [items, setItems] = useState<CatalogProduct[]>(initialResult.items)
  const [sortBy, setSortBy] = useState<SortKey>('newest')
  const [availableOnly, setAvailableOnly] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const requestRef = useRef(0)

  async function changeSort(value: SortKey) {
    const request = ++requestRef.current
    setSortBy(value)
    setError(false)
    if (value === 'price_asc' || value === 'price_desc') {
      // The catalog HTTP adapter has no server price-sort mapping. Sort this fetched page only.
      setItems(initialResult.items)
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const result = await api.listProducts({ categoryId, page, perPage: initialResult.meta.perPage, sortBy: value })
      if (request === requestRef.current) setItems(result.items)
    } catch {
      if (request === requestRef.current) setError(true)
    } finally {
      if (request === requestRef.current) setLoading(false)
    }
  }

  const visibleItems = availableOnly ? items.filter(item => item.stockStatus !== 'OUT_OF_STOCK') : items
  const orderedItems = sortBy === 'price_asc' || sortBy === 'price_desc'
    ? [...visibleItems].sort((a, b) => {
        if (a.priceAvailable === false) return b.priceAvailable === false ? 0 : 1
        if (b.priceAvailable === false) return -1
        const first = BigInt(a.price.amount)
        const second = BigInt(b.price.amount)
        const comparison = first < second ? -1 : first > second ? 1 : 0
        return sortBy === 'price_asc' ? comparison : -comparison
      })
    : visibleItems

  return (
    <div className="lg:hidden">
      <SortBar sortBy={sortBy} onSortChange={value => void changeSort(value)} availableOnly={availableOnly} onAvailableOnlyChange={setAvailableOnly} count={availableOnly ? orderedItems.length : initialResult.meta.total} />
      {(sortBy === 'price_asc' || sortBy === 'price_desc') && <p className="mt-2 text-xs text-slate-500">مرتب‌سازی قیمت روی کالاهای همین صفحه اعمال شده است.</p>}
      {availableOnly && <p className="mt-2 text-xs text-slate-500">فیلتر موجودی روی کالاهای همین صفحه اعمال شده است.</p>}
      {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">دریافت ترتیب جدید کالاها با خطا مواجه شد.</p>}
      {loading ? <p role="status" className="mt-5 text-sm text-slate-600">در حال مرتب‌سازی کالاها...</p> : <div className="mt-5">{orderedItems.length ? <ProductGrid products={orderedItems} /> : <p className="text-sm text-slate-600">کالای موجودی در این صفحه یافت نشد.</p>}</div>}
    </div>
  )
}
