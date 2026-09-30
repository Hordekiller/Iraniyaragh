import type { StorefrontVariant } from '../../services/catalog/types'
import { formatToman, toPersianDigits } from '../../lib/format'
import { formatWeight } from '../../lib/product'

/**
 * Sellable-variant table (نوع‌ها / تنوع‌های کالا).
 *
 * Only rendered for products that actually have more than one active variant.
 * Each row selects that variant, so the price, SKU and availability shown in
 * the buy box always follow the customer's choice.
 */
export function ProductVariantsTable({
  variants,
  selectedId,
  onSelect,
  stockLabel,
}: {
  variants: readonly StorefrontVariant[]
  selectedId: string | null
  onSelect: (id: string) => void
  stockLabel: Record<'available' | 'out', string>
}) {
  return (
    <section aria-labelledby="product-variants" className="rounded-3xl border border-slate-100 bg-white p-5 lg:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 id="product-variants" className="font-black text-slate-900 text-base">
          تنوع‌های این کالا
        </h2>
        <span className="text-xs text-slate-400">{toPersianDigits(variants.length)} تنوع فعال</span>
      </div>

      {/* 2.1.1 Keyboard: the variants table scrolls sideways on narrow screens,
          so the scrollable region is focusable and named rather than
          pointer-only. */}
      <div
        role="region"
        aria-label="جدول تنوع‌های کالا"
        tabIndex={0}
        className="mt-4 overflow-x-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4D00] focus-visible:ring-offset-2 rounded-2xl"
      >
        <table className="w-full text-right text-[13px] border-collapse">
          <caption className="sr-only">فهرست تنوع‌های فعال این کالا به همراه کد کالا، قیمت و وضعیت موجودی</caption>
          <thead>
            <tr className="text-slate-500 border-b border-slate-100">
              <th scope="col" className="py-2 font-bold">تنوع</th>
              <th scope="col" className="py-2 font-bold">کد کالا</th>
              <th scope="col" className="py-2 font-bold">قیمت</th>
              <th scope="col" className="py-2 font-bold">موجودی</th>
            </tr>
          </thead>
          <tbody>
            {variants.map(variant => {
              const isSelected = variant.id === selectedId
              const weight = formatWeight(variant.weightGrams)
              return (
                <tr
                  key={variant.id}
                  className={isSelected ? 'bg-slate-50' : undefined}
                  aria-selected={isSelected}
                >
                  <th scope="row" className="py-2.5 font-bold text-slate-900">
                    <button
                      type="button"
                      onClick={() => onSelect(variant.id)}
                      aria-pressed={isSelected}
                      className="text-right rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4D00] focus-visible:ring-offset-2"
                    >
                      {variant.title ?? 'استاندارد'}
                      {weight ? <span className="block text-[11px] font-normal text-slate-400">{weight}</span> : null}
                    </button>
                  </th>
                  <td dir="ltr" className="py-2.5 text-right text-slate-600">{variant.sku}</td>
                  <td className="py-2.5 font-bold text-slate-900 whitespace-nowrap">
                    {formatToman(variant.salePrice.amount)}
                  </td>
                  <td className="py-2.5">
                    <span
                      className={[
                        'px-2 py-0.5 rounded-full text-[11px] font-black whitespace-nowrap',
                        variant.available ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500',
                      ].join(' ')}
                    >
                      {stockLabel[variant.available ? 'available' : 'out']}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
