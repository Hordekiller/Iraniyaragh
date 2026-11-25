import { ListFilter } from 'lucide-react'
import { toPersianDigits } from '../../lib/format'
import type { CatalogQuery } from '../../services/catalog/types'

type SortKey = NonNullable<CatalogQuery['sortBy']>
const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'popular', label: 'پرفروش‌ترین' },
  { key: 'newest', label: 'جدیدترین' },
  { key: 'price_asc', label: 'ارزان‌ترین' },
  { key: 'price_desc', label: 'گران‌ترین' },
]

export function SortBar({ sortBy, onSortChange, availableOnly, onAvailableOnlyChange, count }: {
  sortBy: SortKey
  onSortChange: (sort: SortKey) => void
  availableOnly: boolean
  onAvailableOnlyChange: (value: boolean) => void
  count: number
}) {
  return (
    <section aria-label="مرتب‌سازی و فیلتر کالاها" className="mt-5 rounded-[20px] border border-slate-200 bg-white p-3 lg:hidden">
      <div className="flex items-center gap-2"><span className="flex shrink-0 items-center gap-1 text-xs font-black text-slate-900"><ListFilter size={17} aria-hidden="true" /> مرتب‌سازی:</span><div role="group" aria-label="ترتیب نمایش کالاها" className="flex min-w-0 gap-1.5 overflow-x-auto pb-1 [scrollbar-width:thin]">{SORT_OPTIONS.map(option => <button key={option.key} type="button" onClick={() => onSortChange(option.key)} aria-pressed={sortBy === option.key} className={`min-h-10 shrink-0 rounded-full border px-2.5 text-[11px] font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4D00] ${sortBy === option.key ? 'border-[#FF4D00] bg-orange-50 text-[#9A3412]' : 'border-transparent bg-white text-slate-600 hover:bg-orange-50'}`}>{option.label}</button>)}</div></div>
      <div className="mt-2 flex items-center justify-between gap-2"><label className="flex cursor-pointer items-center gap-2 text-xs font-bold text-slate-900"><input type="checkbox" checked={availableOnly} onChange={event => onAvailableOnlyChange(event.target.checked)} className="peer sr-only" /><span aria-hidden="true" className="relative h-6 w-11 rounded-full bg-slate-200 transition-colors after:absolute after:right-1 after:top-1 after:size-4 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:bg-[#FF4D00] peer-checked:after:-translate-x-5 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[#FF4D00] motion-reduce:transition-none motion-reduce:after:transition-none" /> فقط کالاهای موجود</label><span className="shrink-0 rounded-full bg-orange-50 px-2.5 py-1.5 text-[11px] font-bold text-slate-900">{toPersianDigits(count)} محصول</span></div>
    </section>
  )
}
