import { useEffect, useState } from 'react'
import { BellRing } from 'lucide-react'
import { useCatalogApi } from '../../state/catalog-context'
import type { CatalogBrand } from '../../services/catalog/types'

const BRAND_LIMIT = 16

export function NewsletterBrands() {
  const api = useCatalogApi()
  const [brands, setBrands] = useState<CatalogBrand[] | null>(null)

  useEffect(() => {
    let cancelled = false
    api
      .listBrands()
      .then(data => {
        if (cancelled) return
        setBrands(data.slice(0, BRAND_LIMIT))
      })
      .catch(() => {
        if (cancelled) return
        setBrands([])
      })
    return () => {
      cancelled = true
    }
  }, [api])

  return (
    <section className="max-w-[1280px] mx-auto px-4 lg:px-6 mt-6">
      <div className="rounded-[24px] lg:rounded-[28px] bg-gradient-to-l from-[#FF4D00] to-[#ff7a00] p-5 lg:p-7 text-white relative overflow-hidden">
        <div className="absolute -left-10 -top-10 w-40 h-40 rounded-full bg-white/15 blur-2xl" />
        <div className="absolute -right-10 bottom-0 w-60 h-60 rounded-full bg-black/10 blur-3xl" />
        <div className="relative flex flex-col lg:flex-row items-center justify-between gap-6">
          <div className="flex-1">
            <h2 className="font-black text-[18px] lg:text-[20px]">عضو خبرنامه شوید</h2>
            <p className="text-white/85 text-[13px] mt-1.5 leading-6">پس از فعال‌شدن خبرنامه، از تازه‌های فروشگاه و پیشنهادها باخبر خواهید شد. به‌زودی.</p>
          </div>
          <div className="shrink-0">
            <span className="inline-flex items-center gap-2 h-12 px-7 rounded-full bg-[#0F172A] text-white font-black text-sm">
              <BellRing size={16} /> به‌زودی
            </span>
          </div>
        </div>
      </div>

      {(brands === null || brands.length > 0) && (
        <div role="list" aria-label="برندهای موجود" tabIndex={0} className="mt-6 flex items-center gap-3 lg:gap-6 overflow-x-auto scrollbar-none py-2 px-2 rounded-[20px] bg-[#0F172A">
          {brands?.map(brand => (
            <div key={brand.id} role="listitem" className="shrink-0 h-14 px-7 rounded-2xl bg-white border border-slate-100 flex items-center justify-center font-black tracking-widest text-slate-500 text-sm">{brand.name}</div>
          ))}
        </div>
      )}
    </section>
  )
}