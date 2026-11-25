import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CategoryGrid } from '../components/catalog/CategoryGrid'
import { CategoryChips } from '../components/catalog/CategoryChips'
import { SortBar } from '../components/catalog/SortBar'
import { ProductGrid } from '../components/product/ProductGrid'
import { useCatalogApi } from '../state/catalog-context'
import { toPersianDigits } from '../lib/format'
import { ROUTES } from '../lib/routes'
import type { CatalogCategory, CatalogProduct, CatalogQuery, CatalogListResult } from '../services/catalog/types'

export function CategoryPage() {
  const api = useCatalogApi()
  const { slug = '' } = useParams<{ slug: string }>()
  const [items, setItems] = useState<CatalogProduct[] | null>(null)
  const [categories, setCategories] = useState<CatalogCategory[]>([])
  const [meta, setMeta] = useState<CatalogListResult['meta'] | null>(null)
  const [sortBy, setSortBy] = useState<NonNullable<CatalogQuery['sortBy']>>('newest')
  const [sortTouched, setSortTouched] = useState(false)
  const [availableOnly, setAvailableOnly] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [resolvedSlug, setResolvedSlug] = useState(slug)
  if (resolvedSlug !== slug) {
    setResolvedSlug(slug)
    setItems(null)
    setCategories([])
    setMeta(null)
    setSortBy('newest')
    setSortTouched(false)
    setAvailableOnly(false)
    setError(null)
  }

  useEffect(() => {
    let cancelled = false

    Promise.all([api.listCategories(), api.listProducts({ categorySlug: slug, ...(sortTouched ? { sortBy } : {}) })])
      .then(([categories, result]) => {
        if (cancelled) return
        setCategories(categories)
        setItems(result.items)
        setMeta(result.meta)
      })
      .catch(() => {
        if (cancelled) return
        setError('دریافت دسته‌بندی با خطا مواجه شد.')
      })

    return () => {
      cancelled = true
    }
  }, [api, slug, sortBy, sortTouched])

  // Availability is a client-side filter over this fetched page only; no unsupported API parameter is sent.
  const visibleItems = availableOnly ? items?.filter(item => item.stockStatus !== 'OUT_OF_STOCK') : items
  // The catalog adapter has no server price-sort mapping; order the returned page only.
  const orderedItems = visibleItems && (sortBy === 'price_asc' || sortBy === 'price_desc')
    ? [...visibleItems].sort((a, b) => {
        if (a.priceAvailable === false) return b.priceAvailable === false ? 0 : 1
        if (b.priceAvailable === false) return -1
        const first = BigInt(a.price.amount)
        const second = BigInt(b.price.amount)
        const comparison = first < second ? -1 : first > second ? 1 : 0
        return sortBy === 'price_asc' ? comparison : -comparison
      })
    : visibleItems
  const displayedCount = availableOnly ? (visibleItems?.length ?? 0) : (meta?.total ?? items?.length ?? 0)

  const category = categories.find(item => item.slug === slug) ?? null
  const children = category ? categories.filter(item => item.parentId === category.id) : []
  const siblings = category ? categories.filter(item => item.parentId === category.parentId) : []
  const chipCategories = [...siblings, ...children.filter(item => !siblings.some(sibling => sibling.id === item.id))]
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
        <span className="mx-1" aria-hidden="true">/</span>
        <Link to={ROUTES.categories} className="hover:text-[#FF4D00]">همه دسته‌بندی‌ها</Link>
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

      {category && <CategoryChips categories={chipCategories} activeId={category.id} />}

      {children.length > 0 && (
        <section className="mt-6 hidden lg:block" aria-labelledby="category-children-title">
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
          <p className="mt-2 hidden text-xs text-slate-400 lg:block">{toPersianDigits(items.length)} کالا</p>
          <SortBar sortBy={sortBy} onSortChange={value => { setItems(null); setError(null); setSortBy(value); setSortTouched(true) }} availableOnly={availableOnly} onAvailableOnlyChange={setAvailableOnly} count={displayedCount} />
          {(sortBy === 'price_asc' || sortBy === 'price_desc') && <p className="mt-2 text-xs text-slate-500 lg:hidden">مرتب‌سازی قیمت روی کالاهای همین صفحه اعمال شده است.</p>}
          {availableOnly && <p className="mt-2 text-xs text-slate-500 lg:hidden">فیلتر موجودی روی کالاهای همین صفحه اعمال شده است.</p>}
          <div className="mt-5">
            {orderedItems?.length ? <ProductGrid products={orderedItems} /> : <p className="text-sm text-slate-500">کالای موجودی در این صفحه یافت نشد.</p>}
          </div>
        </>
      )}
    </div>
  )
}
