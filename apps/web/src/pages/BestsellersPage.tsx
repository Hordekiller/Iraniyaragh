import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ProductGrid } from '../components/product/ProductGrid'
import { useCatalogApi } from '../state/catalog-context'
import { toPersianDigits } from '../lib/format'
import { ROUTES } from '../lib/routes'
import type { CatalogProduct } from '../services/catalog/types'

export function BestsellersPage() {
  const api = useCatalogApi()
  const [items, setItems] = useState<CatalogProduct[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    api
      .listProducts({ sortBy: 'popular' })
      .then(result => {
        if (cancelled) return
        setItems(result.items)
      })
      .catch(() => {
        if (cancelled) return
        setError('دریافت پرفروش‌ها با خطا مواجه شد.')
      })

    return () => {
      cancelled = true
    }
  }, [api])

  return (
    <div className="max-w-[1280px] mx-auto px-4 lg:px-6 py-6">
      <nav aria-label="مسیر پرفروش‌ها" className="text-xs text-slate-400 mb-3">
        <Link to={ROUTES.home} className="hover:text-[#FF4D00]">
          خانه
        </Link>
        <span className="mx-1">/</span>
        <Link to={ROUTES.search} className="hover:text-[#FF4D00]">
          کالاها
        </Link>
        <span className="mx-1">/</span>
        <span className="text-slate-600 font-bold">پرفروش‌ترین‌ها</span>
      </nav>

      <h1 className="font-black text-slate-900 text-lg lg:text-xl">پرفروش‌ترین‌ها</h1>

      {items === null && !error && (
        <div className="mt-8 text-slate-500" aria-live="polite">
          در حال بارگذاری...
        </div>
      )}

      {error && (
        <div className="mt-8 rounded-2xl bg-red-50 border border-red-200 text-red-700 p-4 text-sm font-bold" role="alert">
          {error}
        </div>
      )}

      {items && items.length === 0 && (
        <p className="mt-8 text-slate-500 text-sm">هنوز پرفروشی ثبت نشده است.</p>
      )}

      {items && items.length > 0 && (
        <>
          <p className="mt-2 text-xs text-slate-400">{toPersianDigits(items.length)} کالا</p>
          <div className="mt-5">
            <ProductGrid products={items} />
          </div>
        </>
      )}
    </div>
  )
}