import type { CatalogSort } from '../../services/catalog/types'

/**
 * Sort options the public catalog can actually serve.
 *
 * The public catalog contract exposes no price range and no sales ranking, so
 * there is deliberately no price or "popular" option here: offering one would
 * either fail at the API or quietly sort by something other than its label.
 */
export const SORT_OPTIONS: ReadonlyArray<{ value: CatalogSort; label: string }> = [
  { value: 'newest', label: 'جدیدترین' },
  { value: 'name', label: 'نام (الف تا ی)' },
  { value: 'name_desc', label: 'نام (ی تا الف)' },
]
