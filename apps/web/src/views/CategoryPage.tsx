import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CategoryGrid } from '../components/catalog/CategoryGrid'
import { ProductGrid } from '../components/product/ProductGrid'
import { useCatalogApi } from '../state/catalog-context'
import { toPersianDigits } from '../lib/format'
import { ROUTES } from '../lib/routes'
import type { CatalogCategory, CatalogProduct } from '../services/catalog/types'

export function CategoryPage() {
  const api = useCatalogApi()
  const { slug = '' } = useParams<{ slug: string }>()
  const [items, setItems] = useState<CatalogProduct[] | null>(null)
  const [categories, setCategories] = useState<CatalogCategory[]>([])
  const [error, setError] = useState<string | null>(null)

  const [resolvedSlug, setResolvedSlug] = useState(slug)
  if (resolvedSlug !== slug) {
    setResolvedSlug(slug)
    setItems(null)
    setCategories([])
    setError(null)
  }

  useEffect(() => {
    let cancelled = false

    Promise.all([api.listCategories(), api.listProducts({ categorySlug: slug })])
      .then(([categories, result]) => {
        if (cancelled) return
        setCategories(categories)
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

  const category = categories.find(item => item.slug === slug) ?? null
  const children = category ? categories.filter(item => item.parentId === category.id) : []
  const byId = new Map(categories.map(item => [item.id, item]))
  const ancestors: CatalogCategory[] = []
  const visited = new Set(category ? [category.id] : [])
  let parentId = category?.parentId
  while (parentId && !visited.has(parentId)) {
    visited.add(parentId)
    const parent = byId.get(parentId)
    if (!parent) break
    ancestors.unshift(parent)
    parentId = parent.parentId
  }

  return (
    <div className="max-w-[1280px] mx-auto px-4 lg:px-6 py-6">
      <nav aria-label="مسیر دسته‌بندی" className="text-xs text-slate-400 mb-3">
        <Link to={ROUTES.home} className="hover:text-[#FF4D00]">خانه</Link>
        {ancestors.map(ancestor => (
          <span key={ancestor.id}>
            <span className="mx-1" aria-hidden="true">/</span>
            <Link to={ROUTES.category(ancestor.slug)} className="hover:text-[#FF4D00]">{ancestor.name}</Link>
          </span>
        ))}
        <span className="mx-1" aria-hidden="true">/</span>
        <span aria-current="page" className="text-slate-600 font-bold">{category?.name ?? 'دسته‌بندی'}</span>
      </nav>

      <h1 className="font-black text-slate-900 text-lg lg:text-xl">{category?.name ?? 'دسته‌بندی'}</h1>

      {children.length > 0 && (
        <section className="mt-6" aria-labelledby="category-children-title">
          <h2 id="category-children-title" className="text-base font-bold text-slate-900">زیردسته‌های {category?.name}</h2>
          <CategoryGrid categories={children} />
        </section>
      )}

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
