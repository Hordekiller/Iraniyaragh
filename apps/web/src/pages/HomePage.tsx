import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { CategoryGrid } from '../components/catalog/CategoryGrid'
import { HeroSlider } from '../components/content/HeroSlider'
import { NewsletterStatus } from '../components/content/NewsletterStatus'
import { ProductCarousel } from '../components/product/ProductCarousel'
import { ROUTES } from '../lib/routes'
import { SECTION_IDS } from '../lib/site-config'
import type { CatalogCategory, CatalogProduct } from '../services/catalog/types'
import { useCatalogApi } from '../state/catalog-context'
import { setDynamicMetadata, setCanonicalUrl } from '../lib/use-route-metadata'

type HomePageLocationState = { scrollToCategories?: boolean }
type HomeCategoryCollection = { category: CatalogCategory; sortBy: 'NEWEST' | 'BESTSELLING'; products: CatalogProduct[] | null }
type HomeCatalog = {
  categories: CatalogCategory[] | null
  categoryCollections: HomeCategoryCollection[]
}
const fixtureCatalogEnabled = import.meta.env.VITE_FIXTURE_CATALOG === 'true'
const HOME_PRODUCT_LIMIT = 8

export function HomePage() {
  useEffect(() => {
    setDynamicMetadata({
      title: 'فروشگاه تخصصی ابزار و یراق‌آلات',
      description: 'ایرانی یراق — فروشگاه تخصصی یراق‌آلات و ابزار با تجربه خرید سریع و حرفه‌ای',
      type: 'website',
    })
    setCanonicalUrl(window.location.origin + '/')
  }, [])
  const api = useCatalogApi()
  const navigate = useNavigate()
  const location = useLocation()
  const handledKeyRef = useRef<string | null>(null)
  const [catalog, setCatalog] = useState<HomeCatalog | null>(null)
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(true)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const state = location.state as HomePageLocationState | null
    if (!catalog?.categories || !state?.scrollToCategories || handledKeyRef.current === location.key) return
    handledKeyRef.current = location.key
    document.getElementById(SECTION_IDS.categories)?.scrollIntoView({ behavior: 'smooth' })
    navigate(ROUTES.home, { replace: true, state: {} })
  }, [location.state, location.key, navigate, catalog])

  useEffect(() => {
    let cancelled = false
    let request = 0
    const refresh = () => {
      const current = ++request
      setLoading(true)
      setError(false)
      void Promise.allSettled([
        api.listCategories(),
        api.getHomepageCollections(),
      ]).then(async ([categoriesResult, collectionsResult]) => {
        if (cancelled || current !== request) return

        const categories = categoriesResult.status === 'fulfilled'
          ? categoriesResult.value.filter(category => category.parentId === null)
          : null
        const settings = collectionsResult.status === 'fulfilled' ? collectionsResult.value : null
        const configuredSections = settings?.sections ?? []

        const categoryCollections = await Promise.all(configuredSections.map(async section => {
          const category = (categoriesResult.status === 'fulfilled' ? categoriesResult.value : []).find(item => item.id === section.categoryId)
          if (!category) return null
          try {
            const result = await api.listProducts({ categoryId: category.id, sortBy: section.sortBy === 'BESTSELLING' ? 'popular' : 'newest', perPage: HOME_PRODUCT_LIMIT })
            return { category, sortBy: section.sortBy, products: result.items }
          } catch {
            return { category, sortBy: section.sortBy, products: null }
          }
        }))
        if (cancelled || current !== request) return

        setCatalog({ categories, categoryCollections: categoryCollections.filter((item): item is HomeCategoryCollection => item !== null) })
        setError(categories === null || settings === null || categoryCollections.some(collection => collection?.products === null || collection === null))
        setLoading(false)
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

  const rootCategories = catalog?.categories ?? []

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
            <p>بخشی از اطلاعات فروشگاه دریافت نشد. اطلاعات ناموفق به‌صورت نمونه نمایش داده نمی‌شود.</p>
            <button type="button" onClick={retry} className="mt-3 rounded-xl bg-red-800 px-4 py-2 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-800 focus-visible:ring-offset-2">تلاش دوباره</button>
          </div>
        </div>
      )}
      {loading && !catalog && <p className="max-w-[1280px] mx-auto px-4 lg:px-6 mt-8 text-slate-600" role="status">در حال دریافت کاتالوگ...</p>}

      {catalog && (
        <>
          <section id={SECTION_IDS.categories} className="max-w-[1280px] mx-auto px-4 lg:px-6 mt-8 lg:mt-10" aria-labelledby="home-categories-title">
            <h2 id="home-categories-title" className="text-xl lg:text-2xl font-black text-slate-900">دسته‌بندی کالاها</h2>
            {catalog.categories === null ? (
              <p className="mt-4 text-sm text-slate-600">دسته‌بندی‌ها فعلاً در دسترس نیستند.</p>
            ) : rootCategories.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">هنوز دسته‌بندی منتشرشده‌ای وجود ندارد.</p>
            ) : (
              <CategoryGrid categories={rootCategories} />
            )}
          </section>

          <div className="max-w-[1280px] mx-auto px-4 lg:px-6 pb-10 lg:pb-16">
            {catalog.categoryCollections.map(({ category, sortBy, products }) => products === null ? (
              <section key={category.id} className="mt-10 rounded-2xl border border-slate-200 bg-white p-5" aria-label={`محصولات ${category.name}`}>
                <h2 className="font-black text-slate-900">محصولات {category.name}</h2>
                <p className="mt-2 text-sm text-slate-600">کالاهای این دسته فعلاً دریافت نشدند.</p>
              </section>
            ) : products.length === 0 ? null : (
              <ProductCarousel key={category.id} id={`home-category-${category.slug}`} title={sortBy === 'BESTSELLING' ? `پرفروش‌های ${category.name}` : `جدیدترین ${category.name}`} description={sortBy === 'BESTSELLING' ? 'بر پایهٔ فروش ثبت‌شده و منهای مرجوعی‌های ثبت‌شده' : 'جدیدترین کالاهای منتشرشده در این دسته'} products={products} moreHref={ROUTES.category(category.slug)} />
            ))}
          </div>
        </>
      )}
      <NewsletterStatus />
    </div>
  )
}
