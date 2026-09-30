import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowUpLeft, Drill, Hammer, Leaf, RotateCcw, Ruler, ShieldCheck, Wrench } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { ROUTES } from '../../lib/routes'
import { SECTION_IDS } from '../../lib/site-config'
import { toPersianDigits } from '../../lib/format'
import { useCatalogApi } from '../../state/catalog-context'
import type { CatalogCategory } from '../../services/catalog/types'

/**
 * Presentation only. Category slugs are owned by the database, so the icon and
 * accent are derived from the category id instead of a hardcoded slug table:
 * a category the storefront has never seen still gets a stable, distinct tile.
 */
const ICON_CYCLE: LucideIcon[] = [Wrench, Drill, Hammer, Leaf, Ruler, ShieldCheck]
const ACCENT_CYCLE = ['bg-[#FF4D00]', 'bg-[#0F172A]', 'bg-[#F59E0B]', 'bg-[#0ea5e9]', 'bg-[#10b981]', 'bg-[#84cc16]']

/** Stable per-category slot so reordering or adding categories never reshuffles them. */
function categorySlot(id: string): number {
  let hash = 0
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) % 100_003
  return hash % ICON_CYCLE.length
}

function CategoryCard({ category }: { category: CatalogCategory }) {
  const navigate = useNavigate()
  const slot = categorySlot(category.id)
  const Icon = ICON_CYCLE[slot]
  const accent = ACCENT_CYCLE[slot]

  return (
    <button key={category.id} onClick={() => navigate(ROUTES.category(category.slug))} className="group relative overflow-hidden rounded-[20px] lg:rounded-[24px] bg-white p-4 lg:p-5 text-right hover:shadow-xl hover:shadow-black/40 transition-all duration-300 hover:-translate-y-1 border border-white">
      <div className={`absolute -left-6 -top-6 w-24 h-24 rounded-full ${accent} opacity-[0.08] group-hover:opacity-[0.14] transition`} />
      <div className={`w-12 h-12 rounded-2xl ${accent} text-white flex items-center justify-center shadow-lg`}>
        <Icon size={22} />
      </div>
      <div className="mt-3 lg:mt-4 font-black text-slate-900 text-[14px] lg:text-[15px] leading-none">{category.name}</div>
      <div className="inline-flex mt-3 px-2.5 py-1 rounded-full bg-slate-900 text-white text-[11px] font-bold">{toPersianDigits(category.productCount)} کالا</div>
      <div className="absolute bottom-3 left-3 w-8 h-8 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center group-hover:bg-[#FF4D00] group-hover:text-white group-hover:border-[#FF4D00] transition">
        <ArrowUpLeft size={16} />
      </div>
    </button>
  )
}

export function CategoryGrid() {
  const api = useCatalogApi()
  const [items, setItems] = useState<CatalogCategory[] | null>(null)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const retry = () => {
    setItems(null)
    setError(false)
    setAttempt(n => n + 1)
  }

  useEffect(() => {
    let cancelled = false
    api
      .listCategories()
      .then(data => {
        if (cancelled) return
        setItems(data)
      })
      .catch(() => {
        if (cancelled) return
        setError(true)
      })
    return () => {
      cancelled = true
    }
  }, [api, attempt])

  return (
    <section id={SECTION_IDS.categories} className="max-w-[1280px] mx-auto px-4 lg:px-6 mt-8 lg:mt-10">
      <div className="bg-[#0F172A] rounded-[24px] lg:rounded-[28px] p-5 lg:p-8">
        <div>
          <div className="inline-flex items-center gap-2 text-[11px] font-black tracking-widest text-[#FF4D00]">CATEGORIES <span className="w-8 h-px bg-[#FF4D00]" /></div>
          <h2 className="text-[22px] lg:text-[28px] font-black text-white leading-none mt-2">دسته‌بندی تخصصی ابزار</h2>
          <p className="text-white/60 text-[13px] mt-2">مرور دسته‌بندی‌های فروشگاه با شمار کالاهای ثبت‌شده</p>
        </div>

        {items === null && !error && (
          <div className="mt-6 text-white/70 text-sm" aria-live="polite">در حال بارگذاری دسته‌بندی‌ها...</div>
        )}

        {error && (
          <div className="mt-6 rounded-2xl bg-red-50 border border-red-200 p-4">
            <p role="alert" className="text-sm font-bold text-red-700">
              بارگذاری دسته‌بندی‌ها با خطا مواجه شد.
            </p>
            <button
              type="button"
              onClick={retry}
              className="mt-3 inline-flex h-9 items-center gap-2 rounded-full border border-red-200 bg-white px-4 text-xs font-bold text-red-800 transition hover:border-red-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-700"
            >
              <RotateCcw size={14} aria-hidden="true" />
              تلاش دوباره
            </button>
          </div>
        )}

        {items && items.length > 0 && (
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 lg:gap-4 mt-6">
            {items.map(category => (
              <CategoryCard key={category.id} category={category} />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}