import { toPersianDigits } from '../../lib/format'
import { SORT_OPTIONS } from './sort-options'
import type { CatalogBrand, CatalogQuery } from '../../services/catalog/types'

export function ProductSortSelect({
  value,
  onChange,
  id,
}: {
  value: CatalogQuery['sortBy']
  onChange: (value: NonNullable<CatalogQuery['sortBy']>) => void
  id: string
}) {
  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="text-xs font-bold text-slate-500">مرتب‌سازی</label>
      <select
        id={id}
        value={value}
        onChange={event => onChange(event.target.value as NonNullable<CatalogQuery['sortBy']>)}
        className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#FF4D00]/30 focus:border-[#FF4D00]"
      >
        {SORT_OPTIONS.map(option => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </div>
  )
}

/**
 * Brand filter built from the brands the live catalog actually returns. An empty
 * brand list renders nothing rather than a control that cannot filter anything.
 */
export function BrandFilter({
  brands,
  selected,
  onChange,
  id,
}: {
  brands: readonly CatalogBrand[]
  selected: string | null
  onChange: (slug: string | null) => void
  id: string
}) {
  if (brands.length === 0) return null
  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="text-xs font-bold text-slate-500">برند</label>
      <select
        id={id}
        value={selected ?? ''}
        onChange={event => onChange(event.target.value || null)}
        className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#FF4D00]/30 focus:border-[#FF4D00]"
      >
        <option value="">همه برندها ({toPersianDigits(brands.length)})</option>
        {brands.map(brand => (
          <option key={brand.id} value={brand.slug}>{brand.name}</option>
        ))}
      </select>
    </div>
  )
}
