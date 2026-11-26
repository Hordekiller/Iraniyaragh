import type { CatalogVariant } from '../../services/catalog/types'

type VariantSelectProps = {
  variants: CatalogVariant[]
  value: string
  onChange: (id: string) => void
}

export function VariantSelect({ variants, value, onChange }: VariantSelectProps) {
  if (variants.length < 2) return null

  return (
    <label className="block text-xs font-bold text-slate-700">
      انتخاب تنوع
      <select
        value={value}
        onChange={event => onChange(event.target.value)}
        className="mt-1 w-full min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-2 py-2 text-xs text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4D00]"
      >
        {variants.map(variant => (
          <option key={variant.id} value={variant.id}>
            {variant.title || variant.attributes.map(attribute => attribute.optionLabel).join(' / ') || variant.sku}
          </option>
        ))}
      </select>
    </label>
  )
}
