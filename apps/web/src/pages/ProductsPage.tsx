import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ProductGrid } from '../components/product/ProductGrid'
import { toPersianDigits } from '../lib/format'
import { ROUTES } from '../lib/routes'
import type { CatalogListResult } from '../services/catalog/types'
import { useCatalogApi } from '../state/catalog-context'

const PAGE_SIZE = 24

export function ProductsPage() {
  const api = useCatalogApi()
  const [page, setPage] = useState(1)
  const [attempt, setAttempt] = useState(0)
  const [response, setResponse] = useState<{ page: number; attempt: number; value: CatalogListResult } | null>(null)
  const [failure, setFailure] = useState<{ page: number; attempt: number } | null>(null)

  useEffect(() => {
    let cancelled = false
    api.listProducts({ page, perPage: PAGE_SIZE, sortBy: 'newest' })
      .then(value => { if (!cancelled) setResponse({ page, attempt, value }) })
      .catch(() => { if (!cancelled) setFailure({ page, attempt }) })
    return () => { cancelled = true }
  }, [api, page, attempt])

  const result = response?.page === page && response.attempt === attempt ? response.value : null
  const error = failure?.page === page && failure.attempt === attempt
  const pages = result?.meta.pages ?? 0
  return (
    <main className="mx-auto max-w-[1280px] px-4 py-6 lg:px-6 lg:py-10">
      <nav aria-label="مسیر کالاها" className="mb-4 text-sm text-slate-500">
        <Link to={ROUTES.home} className="hover:text-orange-700">خانه</Link>
        <span className="mx-2" aria-hidden="true">/</span>
        <span aria-current="page" className="font-bold text-slate-800">همهٔ محصولات</span>
      </nav>
      <header className="rounded-3xl border border-orange-100 bg-gradient-to-l from-orange-50 via-white to-white p-5 sm:p-7">
        <p className="text-sm font-bold text-orange-800">فروشگاه ایرانی یراق</p>
        <h1 className="mt-2 text-2xl font-black text-slate-950 sm:text-3xl">همهٔ محصولات</h1>
        <p className="mt-2 text-sm leading-7 text-slate-600">کالاهای منتشرشده را بر اساس تازه‌ترین انتشار مرور کنید.</p>
      </header>

      {result && <p className="mt-6 text-sm text-slate-600" aria-live="polite">{toPersianDigits(result.meta.total)} کالا در فروشگاه</p>}
      {!result && !error && <p className="mt-8 text-slate-600" role="status">در حال دریافت محصولات…</p>}
      {error && <div className="mt-8 rounded-2xl border border-red-200 bg-red-50 p-5 text-red-800" role="alert">
        <p>دریافت محصولات با خطا مواجه شد؛ فهرست نمونه نمایش داده نمی‌شود.</p>
        <button type="button" className="mt-3 rounded-xl bg-red-800 px-4 py-2 font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-800 focus-visible:ring-offset-2" onClick={() => setAttempt(value => value + 1)}>تلاش دوباره</button>
      </div>}
      {result?.items.length === 0 && <p className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 text-slate-600">هنوز محصول منتشرشده‌ای برای نمایش وجود ندارد.</p>}
      {result && result.items.length > 0 && <div className="mt-3"><ProductGrid products={result.items} /></div>}

      {result && pages > 1 && <nav aria-label="صفحه‌بندی محصولات" className="mt-8 flex items-center justify-center gap-3">
        <button type="button" disabled={page <= 1} onClick={() => setPage(value => Math.max(1, value - 1))} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-800 disabled:cursor-not-allowed disabled:opacity-50">قبلی</button>
        <span aria-live="polite" className="text-sm text-slate-600">صفحهٔ {toPersianDigits(page)} از {toPersianDigits(pages)}</span>
        <button type="button" disabled={page >= pages} onClick={() => setPage(value => Math.min(pages, value + 1))} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-800 disabled:cursor-not-allowed disabled:opacity-50">بعدی</button>
      </nav>}
    </main>
  )
}
