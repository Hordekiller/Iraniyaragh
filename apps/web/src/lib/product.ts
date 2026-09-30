import type { Money } from '@iranyaragh/contracts'
import type { CatalogCategory, CatalogProduct, StorefrontVariant } from '../services/catalog/types'
import { formatToman, toPersianDigits } from './format'

/**
 * Pure presentation helpers for the product detail surface.
 *
 * The public catalog contract deliberately exposes a narrow product shape
 * (`description`, brand, category, active variants with SKU/price/weight, and
 * ready image media). Every helper here derives from exactly those fields and
 * returns `null` when the value is unknown, so the product page can never show
 * an invented specification (docs/PRODUCT_SPEC.md §5, §9).
 */

const LEAD_MAX_CHARS = 220

/**
 * Lead sentence for the product summary block, derived from the catalog
 * `description` text itself. Returns `null` when there is nothing to show, so
 * the caller renders no summary instead of placeholder copy.
 */
export function descriptionLead(description: string | null): string | null {
  if (!description) return null
  const firstBlock = description.split(/\n{2,}/u).map(part => part.trim()).find(Boolean)
  if (!firstBlock) return null
  const flat = firstBlock.replace(/\s+/gu, ' ')
  if (flat.length <= LEAD_MAX_CHARS) return flat
  const clipped = flat.slice(0, LEAD_MAX_CHARS)
  const lastSpace = clipped.lastIndexOf(' ')
  return `${(lastSpace > LEAD_MAX_CHARS * 0.6 ? clipped.slice(0, lastSpace) : clipped).trimEnd()}…`
}

/** Package weight as Persian text, or `null` when the catalog records none. */
export function formatWeight(grams: number | null): string | null {
  if (grams == null || !Number.isFinite(grams) || grams <= 0) return null
  if (grams < 1000) return `${toPersianDigits(Math.round(grams))} گرم`
  const kilos = grams / 1000
  if (Number.isInteger(kilos)) return `${toPersianDigits(kilos)} کیلوگرم`
  return `${toPersianDigits(Math.floor(kilos))}٫${toPersianDigits(Math.round((kilos % 1) * 10))} کیلوگرم`
}

/**
 * Root-to-leaf category trail for the product breadcrumb, resolved from the
 * live category list. Falls back to just the product's own category when the
 * ancestors are not part of the delivered list, and never loops on a malformed
 * `parentId` chain.
 */
export function categoryTrail(
  product: Pick<CatalogProduct, 'category'>,
  categories: readonly CatalogCategory[],
): CatalogCategory[] {
  const own = product.category
  if (!own) return []
  const byId = new Map(categories.map(category => [category.id, category]))
  const trail: CatalogCategory[] = []
  const seen = new Set<string>()
  let current: CatalogCategory | undefined = {
    id: own.id,
    name: own.name,
    slug: own.slug,
    parentId: own.parentId,
    productCount: 0,
    image: '',
  }
  while (current && !seen.has(current.id)) {
    seen.add(current.id)
    trail.unshift(current)
    current = current.parentId ? byId.get(current.parentId) : undefined
  }
  return trail
}

/** Lowest/highest active-variant price, or `null` when no variant is priced. */
export function variantPriceRange(
  variants: readonly StorefrontVariant[],
): { min: Money; max: Money } | null {
  const amounts = variants
    .map(variant => Number(variant.salePrice.amount))
    .filter(amount => Number.isSafeInteger(amount) && amount >= 0)
  if (amounts.length === 0) return null
  const min = Math.min(...amounts)
  const max = Math.max(...amounts)
  return {
    min: { amount: String(min), currency: 'IRR' },
    max: { amount: String(max), currency: 'IRR' },
  }
}

/** Human price-range label; returns `null` when every variant costs the same. */
export function variantPriceRangeLabel(variants: readonly StorefrontVariant[]): string | null {
  const range = variantPriceRange(variants)
  if (!range || range.min.amount === range.max.amount) return null
  return `${formatToman(range.min.amount)} تا ${formatToman(range.max.amount)}`
}
