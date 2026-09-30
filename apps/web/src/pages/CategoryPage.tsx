import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ProductListing } from '../components/catalog/ProductListing'
import { LoadFailure } from '../components/feedback/LoadFailure'
import { useCatalogApi } from '../state/catalog-context'
import { useDocumentMeta } from '../lib/use-document-meta'
import { ROUTES } from '../lib/routes'
import type { CatalogCategory } from '../services/catalog/types'

/**
 * A single category's products.
 *
 * The category is resolved from the live category list, so its title comes from
 * the database rather than the URL slug, and the listing offers the brand filter,
 * the sort options and paging. An unknown slug renders a truthful "not found"
 * state instead of an empty grid that would read as an empty category.
 */
export function CategoryPage() {
  const api = useCatalogApi()
  const { slug = '' } = useParams<{ slug: string }>()
  // Tagged with the slug it was fetched for, so navigating between categories
  // shows loading by comparison instead of resetting state inside the effect.
  const [state, setState] = useState<{
    slug: string
    categories: CatalogCategory[] | null
    failure: boolean
  } | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const retry = useCallback(() => setReloadToken(current => current + 1), [])

  const categories = state?.slug === slug ? state.categories : null
  const failed = Boolean(state?.slug === slug && state.failure)
  const category = categories?.find(item => item.slug === slug) ?? null
  // Only a completed lookup proves the slug is unknown. A failed one is
  // reported as a failure so a network blip never reads as "no such category".
  const notFound = Boolean(categories) && !category

  useDocumentMeta({
    title: category ? category.name : 'دسته‌بندی کالاها',
    description: category
      ? `${category.name} — قیمت و موجودی زندهٔ ${category.name} در فروشگاه.`
      : 'مرور دسته‌بندی کالاهای فروشگاه با قیمت و موجودی زنده.',
    // The category slug is only resolvable once the lookup succeeds, so the
    // canonical URL is held back rather than guessed while loading.
    canonicalPath: category ? ROUTES.category(slug) : undefined,
    noindex: notFound || failed || !category,
  })

  useEffect(() => {
    let cancelled = false
    api
      .listCategories()
      .then(list => {
        if (!cancelled) setState({ slug, categories: list, failure: false })
      })
      .catch(() => {
        if (cancelled) return
        setState({ slug, categories: null, failure: true })
      })
    return () => {
      cancelled = true
    }
  }, [api, slug, reloadToken])

  if (failed) {
    return (
      <div className="max-w-[1280px] mx-auto px-4 lg:px-6 py-6">
        <LoadFailure onRetry={retry} title="دسته‌بندی‌ها بارگذاری نشد" />
      </div>
    )
  }

  if (notFound) {
    return (
      <div className="max-w-[1280px] mx-auto px-4 lg:px-6 py-6">
        <h1 className="font-black text-slate-900 text-lg lg:text-2xl">دسته‌بندی یافت نشد</h1>
        <p className="mt-3 text-slate-500 text-sm">دسته‌بندی با این نشانی در فروشگاه ثبت نشده است.</p>
        <Link to={ROUTES.categories} className="inline-block mt-4 text-xs font-bold text-[#C2410C] hover:underline">
          مشاهده همه دسته‌بندی‌ها
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-[1280px] mx-auto px-4 lg:px-6 py-6">
      <ProductListing
        title={category?.name ?? 'دسته‌بندی'}
        subtitle={category ? `${category.name} در فروشگاه` : null}
        crumbs={[{ label: 'دسته‌بندی کالاها', to: ROUTES.categories }, { label: category?.name ?? 'دسته‌بندی' }]}
        defaultSort="newest"
        categorySlug={slug}
        emptyMessage="در این دسته‌بندی هنوز کالایی ثبت نشده است."
        sortId="category-sort"
        brandId="category-brand"
      />
    </div>
  )
}
