import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useCatalogApi } from '../state/catalog-context'
import { ROUTES } from '../lib/routes'
import { toPersianDigits } from '../lib/format'
import { useDocumentMeta } from '../lib/use-document-meta'
import { buildCategoryTree, type CategoryNode as TreeNode } from '../lib/category-tree'
import { LoadFailure } from '../components/feedback/LoadFailure'
import type { CatalogCategory } from '../services/catalog/types'

/**
 * Full category directory.
 *
 * This is the real destination behind the header/footer "categories" links: it
 * lists every category the catalog returns, with the count the API reports, and
 * nests children under their live parent at any depth. Nothing here is hardcoded
 * — a category that exists only in the database still appears.
 */
export function CategoriesPage() {
  const api = useCatalogApi()
  // Held as one unit so a failed fetch settles into an error state instead of an
  // endless "loading" one, with no synchronous reset inside the effect.
  const [state, setState] = useState<{ items: CatalogCategory[]; error: string | null } | null>(null)
  const [attempt, setAttempt] = useState(0)
  // The failure is cleared here, on the customer's action, rather than inside
  // the effect: the effect may not synchronously setState.
  const retry = () => {
    setState(null)
    setAttempt(n => n + 1)
  }

  useDocumentMeta({
    title: 'دسته‌بندی کالاها',
    description: 'مرور همهٔ دسته‌بندی‌های فروشگاه با تعداد کالاهای ثبت‌شده در هر دسته.',
    canonicalPath: ROUTES.categories,
  })

  useEffect(() => {
    let cancelled = false
    api
      .listCategories()
      .then(items => {
        if (cancelled) return
        setState({ items, error: null })
      })
      .catch(() => {
        if (cancelled) return
        setState({ items: [], error: 'بارگذاری دسته‌بندی‌ها با خطا مواجه شد. لطفاً دوباره تلاش کنید.' })
      })
    return () => {
      cancelled = true
    }
  }, [api, attempt])

  const items = state?.items
  const error = state?.error
  const tree = useMemo(() => buildCategoryTree(items ?? []), [items])

  return (
    <div className="max-w-[1280px] mx-auto px-4 lg:px-6 py-6">
      <nav aria-label="مسیر صفحه" className="text-xs text-slate-500 mb-3">
        <Link to={ROUTES.home} className="hover:text-[#FF4D00]">خانه</Link>
        <span className="mx-1">/</span>
        <span className="text-slate-600 font-bold">دسته‌بندی کالاها</span>
      </nav>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-black text-slate-900 text-lg lg:text-2xl">دسته‌بندی کالاها</h1>
        <Link
          to={ROUTES.products}
          className="rounded-xl border border-slate-200 bg-white text-slate-700 px-3 py-2 text-xs font-bold hover:border-slate-900 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4D00]"
        >
          مشاهده همه کالاها
        </Link>
      </div>

      {items === undefined && (
        <p className="mt-6 text-slate-500" role="status">در حال بارگذاری دسته‌بندی‌ها...</p>
      )}

      {error && (
        <LoadFailure onRetry={retry} message={error} title="بارگذاری دسته‌بندی‌ها ممکن نشد" />
      )}

      {items !== undefined && items.length === 0 && (
        <div className="mt-6 rounded-2xl border border-slate-100 bg-white p-6 text-center">
          <p className="text-slate-600 text-sm">هنوز دسته‌بندی‌ای در فروشگاه ثبت نشده است.</p>
          <Link to={ROUTES.products} className="inline-block mt-3 text-xs font-bold text-[#C2410C] hover:underline">مشاهده همه کالاها</Link>
        </div>
      )}

      {items !== undefined && items.length > 0 && (
        <>
          <p className="mt-2 text-xs text-slate-500">
            {toPersianDigits(items.length)} دسته‌بندی در فروشگاه ثبت شده است.
          </p>
          <ul className="mt-5 grid gap-4 lg:grid-cols-2">
            {tree.map(node => (
              <li key={node.category.id} className="rounded-3xl border border-slate-100 bg-white p-5">
                <CategoryBranch node={node} depth={0} />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

function CategoryBranch({ node, depth }: { node: TreeNode; depth: number }) {
  const { category, children } = node
  // Deeper levels shrink and indent, so a deep catalog stays readable on a phone.
  const emphasis = depth === 0 ? 'text-[15px] lg:text-base' : depth === 1 ? 'text-[13px]' : 'text-xs'

  return (
    <div className={depth > 0 ? 'mt-2 border-t border-slate-100 pt-2' : ''}>
      <Link
        to={ROUTES.category(category.slug)}
        className={`flex items-center justify-between gap-3 rounded-2xl px-3 py-2 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4D00] ${emphasis} font-black text-slate-900`}
        style={depth > 1 ? { paddingInlineStart: `${depth * 12 + 12}px` } : undefined}
      >
        <span className="truncate">{category.name}</span>
        <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-bold text-slate-600">
          {toPersianDigits(category.productCount)} کالا
        </span>
      </Link>
      {children.length > 0 && (
        <ul>
          {children.map(child => (
            <li key={child.category.id}>
              <CategoryBranch node={child} depth={depth + 1} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
