<<<<<<< HEAD
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, Search } from 'lucide-react'
import { NewsletterStatus } from '../components/content/NewsletterStatus'
import { ProductGrid } from '../components/product/ProductGrid'
import { ROUTES } from '../lib/routes'
import { SECTION_IDS, SITE_NAME, SITE_TAGLINE } from '../lib/site-config'
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
    Promise.all([api.listCategories(), api.listProducts()])
      .then(([categories, result]) => {
        if (cancelled) return
        setCatalog({ categories, products: result.items })
        setError(false)
      })
      .catch(() => {
        if (cancelled) return
        setError(true)
      })
    return () => { cancelled = true }
  }, [api, attempt])

  function retry() {
    setError(false)
    setCatalog(null)
    setAttempt(current => current + 1)
=======
import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import type { Product } from '../types/content'
import { HeroSlider } from '../components/hero/HeroSlider'
import { CategoryGrid } from '../components/catalog/CategoryGrid'
import { PopularTools } from '../components/catalog/PopularTools'
import { Bestsellers } from '../components/catalog/Bestsellers'
import { SpecialCollection } from '../components/catalog/SpecialCollection'
import { BlogSection } from '../components/content/BlogSection'
import { ServicesSection } from '../components/content/ServicesSection'
import { NewsletterBrands } from '../components/content/NewsletterBrands'
import { ROUTES } from '../lib/routes'
import { SECTION_IDS } from '../lib/site-config'

type HomePageLocationState = {
  scrollToCategories?: boolean
}

export function HomePage() {
  const navigate = useNavigate()
  const location = useLocation()
  const handledKeyRef = useRef<string | null>(null)

  useEffect(() => {
    const state = location.state as HomePageLocationState | null
    if (!state?.scrollToCategories) return
    if (handledKeyRef.current === location.key) return
    handledKeyRef.current = location.key
    document.getElementById(SECTION_IDS.categories)?.scrollIntoView({ behavior: 'smooth' })
    navigate(ROUTES.home, { replace: true, state: {} })
  }, [location.state, location.key, navigate])

  function handleSelectProduct(product: Product) {
    if (product.slug) {
      navigate(ROUTES.product(product.slug))
    }
>>>>>>> b2d024c (feat(web): harden storefront purchase flow)
  }

  return (
    <div>
<<<<<<< HEAD
      {fixtureCatalogEnabled && (
        <div className="max-w-[1280px] mx-auto px-4 lg:px-6 pt-4" role="note">
          <p className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-950">
            پیش‌نمایش دمو: نام کالا، قیمت، موجودی، امتیاز و تخفیف این صفحه دادهٔ واقعی فروشگاه نیست.
          </p>
        </div>
      )}
      <section className="max-w-[1280px] mx-auto px-4 lg:px-6 pt-4 lg:pt-6">
        <div className="relative overflow-hidden rounded-[24px] lg:rounded-[28px] bg-[#0F172A] px-6 py-12 lg:px-14 lg:py-20 text-white">
          <div aria-hidden="true" className="absolute -left-24 -top-32 size-80 rounded-full bg-[#FF4D00]/20 blur-3xl" />
          <div className="relative max-w-2xl">
            <span className="inline-flex rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-bold">{SITE_NAME}</span>
            <h1 className="mt-5 text-[30px] leading-tight lg:text-[48px] font-black">{SITE_TAGLINE}</h1>
            <p className="mt-4 text-sm lg:text-base leading-8 text-white/80">
              کالاهای منتشرشدهٔ فروشگاه را ببینید، قیمت و وضعیت موجودی را بررسی کنید و سفارش خود را از مسیر امن فروشگاه ثبت کنید.
            </p>
            <Link to={ROUTES.search} className="mt-7 inline-flex items-center gap-2 rounded-full bg-[#C2410C] px-6 py-3 text-sm font-bold text-white hover:bg-[#9A3412] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#0F172A]">
              <Search size={18} aria-hidden="true" /> جستجوی کالا
            </Link>
          </div>
        </div>
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
=======
      <HeroSlider />
      <CategoryGrid />
      <PopularTools onSelectProduct={handleSelectProduct} />

      <section className="max-w-[1280px] mx-auto px-4 lg:px-6 mt-6 grid lg:grid-cols-12 gap-6">
        <Bestsellers onSelectProduct={handleSelectProduct} />
        <SpecialCollection onSelectProduct={handleSelectProduct} />
      </section>

      <BlogSection />
      <ServicesSection />
      <NewsletterBrands />
>>>>>>> b2d024c (feat(web): harden storefront purchase flow)
    </div>
  )
}
