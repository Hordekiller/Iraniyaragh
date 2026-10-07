import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { HeroSlider } from '../components/content/HeroSlider'
import { NewsletterStatus } from '../components/content/NewsletterStatus'
import { ProductGrid } from '../components/product/ProductGrid'
import { ROUTES } from '../lib/routes'
import { SECTION_IDS } from '../lib/site-config'
import type { CatalogCategory, CatalogProduct } from '../services/catalog/types'
import { useCatalogApi } from '../state/catalog-context'

type HomePageLocationState = { scrollToCategories?: boolean }
type HomeCatalog = { categories: CatalogCategory[]; products: CatalogProduct[] }
const fixtureCatalogEnabled = import.meta.env.VITE_FIXTURE_CATALOG === 'true'

export function HomePage() {
  const api = useCatalogApi()
  const navigate = useNavigate()
  const location = useLocation()
  const handledKeyRef = useRef<string | null>(null)
  const [catalog, setCatalog] = useState<HomeCatalog | null>(null)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const state = location.state as HomePageLocationState | null
    if (!catalog || !state?.scrollToCategories || handledKeyRef.current === location.key) return
    handledKeyRef.current = location.key
    document.getElementById(SECTION_IDS.categories)?.scrollIntoView({ behavior: 'smooth' })
    navigate(ROUTES.home, { replace: true, state: {} })
  }, [location.state, location.key, navigate, catalog])

  useEffect(() => {
    let cancelled = false
    let request = 0
    const refresh = () => {
      const current = ++request
      void Promise.all([api.listCategories(), api.listProducts({ sortBy: 'newest' })])
      .then(([categories, result]) => {
        if (cancelled || current !== request) return
        setCatalog({ categories, products: result.items })
        setError(false)
      })
      .catch(() => {
        if (cancelled || current !== request) return
        setError(true)
      })
    }
    const onVisible = () => { if (document.visibilityState === 'visible') refresh() }
    refresh()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [api, attempt])

  function retry() {
    setError(false)
    setCatalog(null)
    setAttempt(current => current + 1)
  }

  return (
    <div>
      {fixtureCatalogEnabled && (
        <div className="max-w-[1280px] mx-auto px-4 lg:px-6 pt-4" role="note">
          <p className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-950">
            پیش‌نمایش دمو: نام کالا، قیمت، موجودی، امتیاز و تخفیف این صفحه دادهٔ واقعی فروشگاه نیست.
          </p>
        </div>
      )}
      <section className="max-w-[1280px] mx-auto px-4 lg:px-6 pt-4 lg:pt-6">
        <HeroSlider />
      </section>

      {error && (
        <div className="max-w-[1280px] mx-auto px-4 lg:px-6 mt-8" role="alert">
          <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-800">
            <p>دریافت کاتالوگ با خطا مواجه شد. قیمت یا موجودی نمونه نمایش داده نمی‌شود.</p>
            <button type="button" onClick={retry} className="mt-3 rounded-xl bg-red-800 px-4 py-2 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-800 focus-visible:ring-offset-2">تلاش دوباره</button>
          </div>
        </div>
      )}
      {!catalog && !error && <p className="max-w-[1280px] mx-auto px-4 lg:px-6 mt-8 text-slate-600" role="status">در حال دریافت کاتالوگ...</p>}

      {catalog && (
        <>
          <section id={SECTION_IDS.categories} className="max-w-[1280px] mx-auto px-4 lg:px-6 mt-8 lg:mt-10" aria-labelledby="home-categories-title">
            <h2 id="home-categories-title" className="text-xl lg:text-2xl font-black text-slate-900">دسته‌بندی کالاها</h2>
            {catalog.categories.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">هنوز دسته‌بندی منتشرشده‌ای وجود ندارد.</p>
            ) : (
              <div className="mt-5 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 lg:gap-4">
                {catalog.categories.map(category => (
                  <Link key={category.id} to={ROUTES.category(category.slug)} className="group flex min-h-28 items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white p-4 hover:border-[#FF4D00]/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4D00]">
                    <span className="font-bold text-slate-900">{category.name}</span>
                    <ArrowLeft size={18} aria-hidden="true" className="shrink-0 text-[#C2410C]" />
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section className="max-w-[1280px] mx-auto px-4 lg:px-6 mt-9" aria-labelledby="home-products-title">
            <h2 id="home-products-title" className="text-xl lg:text-2xl font-black text-slate-900">کالاهای فروشگاه</h2>
            {catalog.products.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">در حال حاضر کالای منتشرشده‌ای برای نمایش وجود ندارد.</p>
            ) : (
              <div className="mt-5"><ProductGrid products={catalog.products} /></div>
            )}
          </section>
        </>
      )}
      <NewsletterStatus />
    </div>
  )
}
