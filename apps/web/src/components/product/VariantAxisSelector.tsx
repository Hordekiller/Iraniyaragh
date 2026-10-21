import { useMemo } from 'react'
import type { CatalogAxis, CatalogProduct } from '../../services/catalog/types'
import {
  availableOptions,
  pruneSelection,
  type AxisSelection,
} from '../../lib/variant-cascade'

export type { AxisSelection, AxisOption, ResolvedVariant } from '../../lib/variant-cascade'

/**
 * Cascading variant selector.
 *
 * The axis order comes from the server; the cascade itself is resolved in
 * `lib/variant-cascade` from the axis values each variant carries. The
 * component never invents a price: the price it reports always comes from a
 * matched variant.
 */
export function VariantAxisSelector({
  product,
  selection,
  onChange,
}: {
  product: CatalogProduct
  selection: AxisSelection
  onChange: (selection: AxisSelection) => void
}) {
  const axes = useMemo(
    () => product.axes.slice().sort((a, b) => a.sortOrder - b.sortOrder),
    [product.axes],
  )

  function select(axis: CatalogAxis, optionCode: string) {
    const next: AxisSelection = { ...selection }
    if (!optionCode) delete next[axis.attributeCode]
    else next[axis.attributeCode] = optionCode
    onChange(pruneSelection(product, next))
  }

  return (
    <div className="mt-5 space-y-3" data-testid="variant-axis-selector">
      {axes.map((axis) => {
        const options = availableOptions(product, selection, axis)
        const value = selection[axis.attributeCode] ?? ''
        const disabled = options.length === 0
        return (
          <div key={axis.attributeCode} className="flex items-center gap-3">
            <label
              htmlFor={`axis-${axis.attributeCode}`}
              className="min-w-[92px] text-sm font-bold text-slate-700"
            >
              {axis.attributeName}
            </label>
            <select
              id={`axis-${axis.attributeCode}`}
              data-testid={`axis-${axis.attributeCode}`}
              value={value}
              disabled={disabled}
              onChange={(event) => select(axis, event.target.value)}
              className="h-11 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
            >
              <option value="">انتخاب کنید</option>
              {options.map((option) => (
                <option key={option.optionCode} value={option.optionCode}>
                  {option.optionLabel}
                </option>
              ))}
            </select>
          </div>
        )
      })}
    </div>
  )
}
