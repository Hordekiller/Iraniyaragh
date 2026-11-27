import Link from 'next/link'
import { ArrowLeft, Headphones, LayoutGrid, Search, ShoppingBag, Sparkles } from 'lucide-react'
import { ShopProducts } from '../../components/shop/ShopProducts'
import { ShopCampaigns } from '../../components/shop/ShopCampaigns'
import { HeroSlider, HomeBanners } from '../../components/shop/ShopMedia'
import type { CatalogQuery } from '../../services/catalog/types'
import { RecentlyViewed } from '../../components/shop/RecentlyViewed'
import { brands, categories, shopConfig } from '../../server/catalog'
import { metadataFor, type SearchParams } from '../../server/policy'
import { JsonLd, breadcrumb } from '../../server/structured-data'
import { ROUTES } from '../../lib/routes'

type Props = { searchParams: Promise<SearchParams> }
export async function generateMetadata({ searchParams }: Props) {
  // The main shop is discoverable; query variants remain outside the index.
  return metadataFor({ title: 'فروشگاه ابزار و یراق‌آلات', description: 'دسته‌بندی‌ها، تازه‌ترین کالاها و پرفروش‌های واقعی ایرانی یراق را ببینید و از کاتالوگ کامل خرید کنید.', path: ROUTES.shop, indexable: Object.keys(await searchParams).length === 0 })
}

export default async function ShopPage() {
  const [allCategories, allBrands, config] = await Promise.all([categories(), brands(), shopConfig()])
  const chosenCategories = config.categoryIds.length ? config.categoryIds.flatMap(id => allCategories.filter(item => item.id === id)) : [...allCategories].filter(item => allCategories.some(category => category.shopFeatured) ? item.shopFeatured : item.parentId === null).sort((a, b) => (a.shopOrder ?? 0) - (b.shopOrder ?? 0))
  const chosenBrands = config.brandIds.length ? config.brandIds.flatMap(id => allBrands.filter(item => item.id === id)) : [...allBrands].filter(item => allBrands.some(brand => brand.shopFeatured) ? item.shopFeatured : true).sort((a, b) => Number(!!b.shopFeatured) - Number(!!a.shopFeatured) || (a.shopOrder ?? 0) - (b.shopOrder ?? 0))

  return <div className="bg-[#faf9f6] pb-12 text-slate-900">
    <div className="mx-auto max-w-[1280px] px-4 pt-5 lg:px-6">
      {process.env.NEXT_PUBLIC_FIXTURE_CATALOG === 'true' && <p role="note" className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-950">پیش‌نمایش دمو: کالاها، قیمت‌ها و موجودی این صفحه دادهٔ واقعی فروشگاه نیستند.</p>}
      <nav aria-label="مسیر صفحه" className="mb-4 text-xs text-slate-500"><Link href={ROUTES.home} className="hover:text-orange-800">خانه</Link><span aria-hidden="true" className="mx-2">/</span><span aria-current="page">فروشگاه</span></nav>
      <section aria-labelledby="shop-title" className="relative overflow-hidden rounded-[2rem] bg-slate-950 px-5 py-9 text-white sm:px-10 sm:py-12 lg:px-14 lg:py-16">
        <div aria-hidden="true" className="pointer-events-none absolute -left-20 -top-24 size-80 rounded-full border-[55px] border-orange-500/15" />
        <div className="relative max-w-2xl">
          <p className="mb-3 flex items-center gap-2 text-sm font-bold text-orange-300"><Sparkles size={17} aria-hidden="true" /> انتخاب برای هر پروژه</p>
          <h1 id="shop-title" className="text-3xl font-black leading-tight sm:text-4xl lg:text-5xl">فروشگاه ایرانی یراق</h1>
          <p className="mt-4 max-w-xl text-sm leading-8 text-slate-200 sm:text-base">از دسته‌بندی دلخواه شروع کنید، تازه‌ترین کالاها را ببینید و برای خرید به اطلاعات و موجودی ثبت‌شدهٔ هر محصول تکیه کنید.</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href={ROUTES.catalog} className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-orange-700 px-5 py-3 text-sm font-bold text-white hover:bg-orange-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">همهٔ کالاها <ArrowLeft size={18} aria-hidden="true" /></Link>
            <Link href={ROUTES.search} className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-white/30 px-5 py-3 text-sm font-bold text-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"><Search size={18} aria-hidden="true" /> جستجوی کالا</Link>
          </div>
        </div>
      </section>
      {config.hero.length > 0 && <div className="mt-5"><HeroSlider banners={config.hero} headingLevel={2} /></div>}
      <form action="/search" method="get" role="search" className="mt-5 flex gap-2"><label htmlFor="shop-search" className="sr-only">جستجوی کالا</label><input id="shop-search" name="q" type="search" placeholder="نام کالا یا برند را جستجو کنید…" className="min-h-12 min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-4" /><button className="min-h-12 rounded-xl bg-orange-700 px-5 font-bold text-white">جستجو</button></form>
      <nav aria-label="دسترسی سریع فروشگاه" className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { href: ROUTES.categories, label: 'دسته‌بندی‌ها', icon: LayoutGrid },
          { href: ROUTES.bestsellers, label: 'پرفروش‌ها', icon: Sparkles },
          { href: '/catalog?discounted=true', label: 'پیشنهادهای ویژه', icon: ShoppingBag },
          { href: ROUTES.help, label: 'راهنمای خرید', icon: Headphones },
        ].map(({ href, label, icon: Icon }) => <Link key={href} href={href} className="flex min-h-16 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-center text-sm font-bold hover:border-orange-300 hover:text-orange-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-700"><Icon size={19} aria-hidden="true" />{label}</Link>)}
      </nav>
      <HomeBanners banners={config.banners} />
      {config.sections.map(section => {
        if (section.kind === 'categories') return chosenCategories.length > 0 && <section key={section.id} className="mt-10"><div className="flex items-center justify-between"><h2 className="text-xl font-black">{section.title}</h2><Link href="/categories" className="text-sm font-bold text-orange-800">همهٔ دسته‌ها</Link></div><p className="mt-2 text-sm text-slate-600">{section.description}</p><div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">{chosenCategories.slice(0, section.limit).map(category => <Link key={category.id} href={ROUTES.category(category.slug)} className="rounded-2xl border border-slate-200 bg-white p-3 text-center hover:border-orange-400"><div className="mb-3 flex aspect-[4/3] items-center justify-center overflow-hidden rounded-xl bg-orange-50">{category.image ? <img src={category.image} alt={category.imageAlt ?? category.name} loading="lazy" width={320} height={240} className="size-full object-contain" /> : <LayoutGrid size={40} className="text-orange-700" aria-hidden="true" />}</div><span className="text-sm font-bold">{category.name}</span></Link>)}</div></section>
        if (section.kind === 'brands') return chosenBrands.length > 0 && <section key={section.id} className="mt-10"><h2 className="text-xl font-black">{section.title}</h2><p className="mt-2 text-sm text-slate-600">{section.description}</p><div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">{chosenBrands.slice(0, section.limit).map(brand => <Link key={brand.id} href={`/brands/${encodeURIComponent(brand.slug)}`} className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white p-4 font-bold hover:border-orange-400">{brand.image && <img src={brand.image.url} alt={brand.imageAlt ?? brand.name} width={120} height={60} loading="lazy" className="h-14 w-28 object-contain" />}{brand.name}</Link>)}</div></section>
        if (section.kind === 'recent') return <RecentlyViewed key={section.id} title={section.title} limit={section.limit} />
        if (section.kind === 'campaigns') return <ShopCampaigns key={section.id} title={section.title} limit={section.limit} />
        if (section.kind === 'manual' && !section.productIds.length) return null
        const query: CatalogQuery = { perPage: section.limit, sortBy: section.kind === 'bestsellers' ? 'popular' : 'newest', ...(section.kind === 'category' ? { categoryId: section.categoryId! } : {}), ...(section.kind === 'manual' ? { ids: section.productIds } : {}), ...(section.kind === 'offers' ? { discounted: true } : {}) }
        const params = new URLSearchParams({ sort: query.sortBy! })
        if (query.categoryId) params.set('categoryId', query.categoryId)
        if (query.ids) params.set('ids', query.ids.join(','))
        if (query.discounted) params.set('discounted', 'true')
        return <ShopProducts key={section.id} id={`shop-${section.id}`} title={section.title} description={section.description} query={query} href={`/catalog?${params}`} offer={section.kind === 'offers'} />
      })}
      <section className="mt-12 rounded-3xl bg-orange-50 p-6 sm:p-8" aria-labelledby="shop-help-title"><h2 id="shop-help-title" className="text-lg font-black">برای انتخاب کالا کمک می‌خواهید؟</h2><p className="mt-2 text-sm leading-7 text-slate-700">راهنمای خرید، شرایط سفارش و راه‌های ارتباط با فروشگاه در دسترس شماست.</p><Link href={ROUTES.help} className="mt-4 inline-flex min-h-11 items-center font-bold text-orange-800 hover:underline">مرکز راهنمای مشتری <ArrowLeft size={17} aria-hidden="true" /></Link></section>
    </div>
    <JsonLd data={breadcrumb([{ name: 'خانه', path: ROUTES.home }, { name: 'فروشگاه', path: ROUTES.shop }])} />
  </div>
}
