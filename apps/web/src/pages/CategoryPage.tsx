import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ProductGrid } from '../components/product/ProductGrid'
import { useCatalogApi } from '../state/catalog-context'
import { toPersianDigits } from '../lib/format'
import { ROUTES } from '../lib/routes'
import type { CatalogCategory, CatalogProduct } from '../services/catalog/types'

export function CategoryPage() {
  const api = useCatalogApi()
  const { slug = '' } = useParams<{ slug: string }>()
  const [items, setItems] = useState<CatalogProduct[] | null>(null)
  const [category, setCategory] = useState<CatalogCategory | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [resolvedSlug, setResolvedSlug] = useState(slug)
  if (resolvedSlug !== slug) {
    setResolvedSlug(slug)
    setItems(null)
    setCategory(null)
    setError(null)
  }

  useEffect(() => {
    let cancelled = false

    Promise.all([api.listCategories(), api.listProducts({ categorySlug: slug })])
      .then(([categories, result]) => {
        if (cancelled) return
        setCategory(categories.find(c => c.slug === slug) ?? null)
        setItems(result.items)
      })
      .catch(() => {
        if (cancelled) return
        setError('دریافت دسته‌بندی با خطا مواجه شد.')
      })

    return () => {
      cancelled = true
    }
  }, [api, slug])

  return (
    <div className="max-w-[1280px] mx-auto px-4 lg:px-6 py-6">
      <nav aria-label="مسیر دسته‌بندی" className="text-xs text-slate-400 mb-3">
        <Link to={ROUTES.home} className="hover:text-[#FF4D00]">خانه</Link>
        <span className="mx-1">/</span>
        <span className="text-slate-600 font-bold">{category?.name ?? 'دسته‌بندی'}</span>
      </nav>

      <h1 className="font-black text-slate-900 text-lg lg:text-xl">{category?.name ?? 'دسته‌بندی'}</h1>

      {items === null && !error && (
        <div className="mt-8 text-slate-500" aria-live="polite">در حال بارگذاری...</div>
      )}

      {error && (
        <div className="mt-8 rounded-2xl bg-red-50 border border-red-200 text-red-700 p-4 text-sm font-bold" role="alert">
          {error}
        </div>
      )}

      {items && items.length === 0 && (
        <p className="mt-8 text-slate-500 text-sm">هیچ محصولی در این دسته‌بندی موجود نیست.</p>
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
