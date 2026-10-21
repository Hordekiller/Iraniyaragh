import type { CatalogAxis, CatalogProduct, CatalogVariant } from '../services/catalog/types'

/**
 * Cascading variant axis resolution.
 *
 * A product can expose several variant axes (mounting type, weight, opening
 * angle, model, …). The axes are ordered by the server and every axis only
 * offers the options that at least one live variant actually carries, so the
 * customer can never reach a combination that cannot be bought.
 *
 * The cascade is resolved here, on the client, from the axis values each
 * variant carries: picking one axis narrows the options of the next ones. A
 * variant that has no value for an axis only stays in the running while that
 * axis is left unselected; the synthetic "unspecified" choice keeps those
 * variants reachable.
 *
 * This module never invents a price: the price it reports always comes from a
 * matched variant.
 */

/** Synthetic option code for variants that carry no value on an axis. */
export const UNSPECIFIED_OPTION_CODE = '__unspecified__'

export type AxisSelection = Record<string, string>

export type AxisOption = {
  optionCode: string
  optionLabel: string
  /** True for the synthetic choice that matches variants without a value. */
  unspecified: boolean
}

export type ResolvedVariant = {
  /** The single variant matching the selection, when the selection is complete. */
  variant: CatalogVariant | null
  /** Every variant still matching the current selection. */
  matches: CatalogVariant[]
  /** Lowest price among the matching variants, in IRR. */
  lowestPrice: string | null
  /** True when the selection resolves to exactly one variant. */
  resolved: boolean
}

export function axisValueOf(variant: CatalogVariant, attributeCode: string): string | null {
  const value = variant.attributes.find(
    (attribute) =>
      attribute.attributeCode === attributeCode && attribute.isVariantAxis,
  )
  return value?.optionCode ?? null
}

/** Whether a variant still matches the given selection. */
export function matchesSelection(
  variant: CatalogVariant,
  selection: AxisSelection,
  axes: CatalogAxis[],
): boolean {
  return axes.every((axis) => {
    const selected = selection[axis.attributeCode]
    if (!selected) return true
    const actual = axisValueOf(variant, axis.attributeCode)
    if (selected === UNSPECIFIED_OPTION_CODE) return actual === null
    return actual === selected
  })
}

/**
 * Options available on an axis given the current selection on the other axes.
 * The axis being resolved is excluded from the filter so its own current
 * choice does not hide the alternatives.
 */
export function availableOptions(
  product: CatalogProduct,
  selection: AxisSelection,
  axis: CatalogAxis,
): AxisOption[] {
  const others = product.axes.filter((item) => item.attributeCode !== axis.attributeCode)
  const matches = product.variants.filter((variant) =>
    matchesSelection(variant, selection, others),
  )
  const options = new Map<string, AxisOption>()
  for (const variant of matches) {
    const value = axisValueOf(variant, axis.attributeCode)
    if (value === null) {
      if (!options.has(UNSPECIFIED_OPTION_CODE))
        options.set(UNSPECIFIED_OPTION_CODE, {
          optionCode: UNSPECIFIED_OPTION_CODE,
          optionLabel: 'نامشخص',
          unspecified: true,
        })
      continue
    }
    if (!options.has(value)) {
      const label =
        axis.options.find((option) => option.optionCode === value)?.optionLabel ??
        value
      options.set(value, { optionCode: value, optionLabel: label, unspecified: false })
    }
  }
  return [...options.values()]
}

/** Resolve the current selection against the product's variants. */
export function resolveSelection(
  product: CatalogProduct,
  selection: AxisSelection,
): ResolvedVariant {
  const matches = product.variants.filter((variant) =>
    matchesSelection(variant, selection, product.axes),
  )
  const lowestPrice = matches.reduce<string | null>((lowest, variant) => {
    const amount = variant.price.amount
    if (lowest === null) return amount
    return BigInt(amount) < BigInt(lowest) ? amount : lowest
  }, null)
  return {
    variant: matches.length === 1 ? matches[0]! : null,
    matches,
    lowestPrice,
    resolved: matches.length === 1,
  }
}

/**
 * Drop selections that no longer resolve after another axis changed, so the
 * customer is never left with a combination that has no variant.
 */
export function pruneSelection(
  product: CatalogProduct,
  selection: AxisSelection,
): AxisSelection {
  const next: AxisSelection = {}
  for (const axis of product.axes) {
    const selected = selection[axis.attributeCode]
    if (!selected) continue
    const stillAvailable = availableOptions(product, next, axis).some(
      (option) => option.optionCode === selected,
    )
    if (stillAvailable) next[axis.attributeCode] = selected
  }
  return next
}

/**
 * The specification of a resolved variant: one row per axis, using the
 * variant's own value where it has one and the synthetic "unspecified" label
 * where the variant carries no value on that axis.
 */
export function resolvedSpecification(
  product: CatalogProduct,
  variant: CatalogVariant,
): Array<{ attributeCode: string; attributeName: string; optionLabel: string }> {
  const axes = product.axes
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
  return axes.map((axis) => {
    const value = variant.attributes.find(
      (attribute) =>
        attribute.attributeCode === axis.attributeCode && attribute.isVariantAxis,
    )
    return {
      attributeCode: axis.attributeCode,
      attributeName: axis.attributeName,
      optionLabel: value?.optionLabel ?? 'نامشخص',
    }
  })
}
