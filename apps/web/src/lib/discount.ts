import type { CatalogProduct } from '../services/catalog/types'

/** Whole-percent discount, only when a verified higher previous price exists. */
export function verifiedDiscountPercent(product: Pick<CatalogProduct, 'price' | 'oldPrice' | 'priceAvailable'>): number | null {
  if (!product.oldPrice || product.priceAvailable === false) return null
  let was: bigint
  let now: bigint
  try { was = BigInt(product.oldPrice.amount); now = BigInt(product.price.amount) } catch { return null }
  if (was <= now || now <= 0n) return null
  const percent = Number(((was - now) * 100n + was / 2n) / was)
  return percent >= 1 ? percent : null
}

