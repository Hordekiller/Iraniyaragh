import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ProductGrid } from '../components/product/ProductGrid'
import { useCatalogApi } from '../state/catalog-context'
import { toPersianDigits } from '../lib/format'
import type { CatalogProduct } from '../services/catalog/types'

export function SearchPage() {
  const api = useCatalogApi()
  const [searchParams] = useSearchParams()
  const query = searchParams.get('q') ?? ''
  const term = query.trim()
  const [items, setItems] = useState<CatalogProduct[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [resolvedQuery, setResolvedQuery] = useState(query)
  if (resolvedQuery !== query) {
    setResolvedQuery(query)
    setItems(null)
    setError(null)
  }

  useEffect(() => {
    let cancelled = false
    if (!term) return
    api
      .listProducts({ search: term })
      .then(result => {
        if (cancelled) return
        setItems(result.items)
      })
      .catch(() => {
        if (cancelled) return
        setError('دریافت نتایج جستجو با خطا مواجه شد. لطفاً دوباره تلاش کنید.')
      })
    return () => {
      cancelled = true
    }
  }, [api, term])

  return (
    <div className="max-w-[1280px] mx-auto px-4 lg:px-6 py-6">
      <h1 className="font-black text-slate-900 text-lg lg:text-xl">
        نتایج جستجو
        {term ? (
          <span className="text-slate-500 font-bold text-sm mr-2">برای «{term}»</span>
        ) : null}
      </h1>

      {!term && (
        <p className="mt-6 text-slate-500 text-sm">عبارتی برای جستجو وارد کنید.</p>
      )}

      {term && items === null && !error && (
        <div className="mt-8 text-slate-500" aria-live="polite">
          در حال جستجو...
        </div>
      )}

      {error && (
        <div className="mt-8 rounded-2xl bg-red-50 border border-red-200 text-red-700 p-4 text-sm font-bold" role="alert">
          {error}
        </div>
      )}

      {term && items !== null && items.length === 0 && !error && (
        <p className="mt-8 text-slate-500 text-sm">
          هیچ محصولی برای «{term}» پیدا نشد.
        </p>
      )}

      {items !== null && items.length > 0 && (
        <div className="mt-6">
          <ProductGrid products={items} />
        </div>
      )}

      {items !== null && items.length > 0 && (
        <p className="mt-6 text-xs text-slate-400">{toPersianDigits(items.length)} کالا یافت شد</p>
      )}
    </div>
  )
}
