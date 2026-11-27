'use client'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { Link } from 'react-router-dom'
import { ProductGrid } from '../components/product/ProductGrid'
import { ROUTES } from '../lib/routes'
import { setWishlisted, subscribeWishlist, wishlistSlugs } from '../lib/wishlist'
import { useCatalogApi } from '../state/catalog-context'
import { useToast } from '../components/feedback/toast-context'
import type { CatalogProduct } from '../services/catalog/types'
export function WishlistPage() {
  const api = useCatalogApi()
  const { show } = useToast()
  const key = useSyncExternalStore(subscribeWishlist, () => wishlistSlugs().join('|'), () => '')
  const [result, setResult] = useState<{ key: string; products: CatalogProduct[]; error: boolean } | null>(null)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    const slugs = key ? key.split('|') : []
    void (slugs.length ? api.listProducts({ slugs, perPage: 40 }) : Promise.resolve({ items: [] })).then(response => {
      if (active) setResult({ key, products: response.items, error: false })
    }, () => { if (active) setResult({ key, products: [], error: true }) })
    return () => { active = false }
  }, [api, key, attempt])
  const current = result?.key === key ? result : null
  const missing = current && !current.error ? key.split('|').filter(slug => slug && !current.products.some(item => item.slug === slug)) : []
  return <div className="mx-auto max-w-[1280px] px-4 py-8 lg:px-6"><nav aria-label="مسیر صفحه" className="mb-5 text-sm"><Link to={ROUTES.shop} className="text-orange-800">فروشگاه</Link> / علاقه‌مندی‌ها</nav><h1 className="text-2xl font-black">علاقه‌مندی‌ها</h1>{!current ? <p role="status" className="mt-6">در حال دریافت کالاها…</p> : current.error ? <div role="alert" className="mt-6">دریافت کالاها انجام نشد. <button className="min-h-11 underline" onClick={() => setAttempt(value => value + 1)}>تلاش دوباره</button></div> : <><div className="mt-6"><ProductGrid products={current.products} /></div>{!key && <p className="mt-6">هنوز کالایی به علاقه‌مندی‌ها اضافه نشده است.</p>}{missing.map(slug => <div key={slug} className="mt-3 flex items-center justify-between gap-3 rounded-xl border p-3"><span>کالای ذخیره‌شده دیگر در دسترس نیست: {slug}</span><button className="min-h-11 shrink-0 text-orange-800" onClick={() => void setWishlisted(slug, false).catch(() => show('حذف انجام نشد؛ دوباره تلاش کنید.'))}>حذف</button></div>)}</>}<Link to={ROUTES.shop} className="mt-4 inline-flex min-h-11 items-center font-bold text-orange-800">بازگشت به فروشگاه</Link></div>
}
