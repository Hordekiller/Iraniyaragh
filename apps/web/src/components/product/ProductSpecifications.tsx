import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'
import type { StorefrontVariant } from '../../services/catalog/types'
import { ROUTES } from '../../lib/routes'
import { toPersianDigits } from '../../lib/format'
import { formatWeight } from '../../lib/product'

/**
 * Product specification table.
 *
 * Rows are rendered only when the public catalog actually returns the value, so
 * the table stays a projection of delivered data instead of a set of invented
 * marketing attributes. When the catalog carries nothing beyond the SKU the
 * section states that explicitly rather than padding itself with placeholders.
 * Availability is deliberately absent here: the stock badge above already states
 * the selected variant's live stock, so repeating it would be a second claim.
 */
export function ProductSpecifications({
  brand,
  category,
  variant,
  variantCount,
}: {
  brand: string | null
  category: { name: string; slug: string } | null
  variant: StorefrontVariant | null
  variantCount: number
}) {
  const weight = formatWeight(variant?.weightGrams ?? null)
  const rows: Array<{ label: string; value: ReactNode }> = []

  if (brand) rows.push({ label: 'برند', value: brand })
  if (category) {
    rows.push({
      label: 'دسته‌بندی',
      value: (
        <Link to={ROUTES.category(category.slug)} className="font-bold text-slate-900 hover:text-[#FF4D00]">
          {category.name}
        </Link>
      ),
    })
  }
  if (variant) rows.push({ label: 'کد کالا (SKU)', value: <span dir="ltr" className="font-bold text-slate-900">{variant.sku}</span> })
  if (variant?.title) rows.push({ label: 'تنوع انتخاب‌شده', value: variant.title })
  if (weight) rows.push({ label: 'وزن بسته', value: weight })
  if (variantCount > 1) rows.push({ label: 'تعداد تنوع‌های فعال', value: toPersianDigits(variantCount) })

  return (
    <section aria-labelledby="product-specs" className="rounded-3xl border border-slate-100 bg-white p-5 lg:p-6">
      <h2 id="product-specs" className="font-black text-slate-900 text-base">
        مشخصات کالا
      </h2>
      {/*
        The heading is always rendered, so an empty <dl> would leave a titled
        box with nothing in it — which reads as "the shop forgot to load this"
        rather than "there is genuinely nothing to show". Say so instead.
      */}
      {rows.length === 0 ? (
        <p className="mt-4 text-[13px] text-slate-500">برای این کالا مشخصاتی ثبت نشده است.</p>
      ) : (
      <dl className="mt-4 divide-y divide-slate-100">
        {rows.map(row => (
          <div key={row.label} className="flex items-start justify-between gap-4 py-2.5">
            <dt className="text-[13px] text-slate-500 shrink-0">{row.label}</dt>
            <dd className="text-[13px] text-slate-900 text-left break-words">{row.value}</dd>
          </div>
        ))}
      </dl>
      )}
    </section>
  )
}
