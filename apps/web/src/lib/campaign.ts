import type { PublicPromotion } from '@iranyaragh/contracts'
import type { CatalogProduct } from '../services/catalog/types'

export type CampaignBadge = { label: string; scheduled: boolean }

/**
 * Truthful campaign label for a product card. Scope (brand, category tree, SKU, exclusions) is resolved by the
 * server against the live catalog, so the card only checks membership. No price or percentage is invented:
 * the label is the administrator's own text. Eligibility at checkout is still decided by the server.
 */
export function campaignBadgeFor(
  product: Pick<CatalogProduct, 'id'>,
  promotions: readonly PublicPromotion[],
): CampaignBadge | null {
  const matches = promotions.filter((promo) =>
    promo.scope.all ? !promo.scope.exceptProductIds.includes(product.id) : promo.scope.productIds.includes(product.id),
  )
  const live = matches.find((p) => !p.scheduled)
  if (live) return { label: live.badgeText ?? live.name, scheduled: false }
  const upcoming = matches.find((p) => p.scheduled)
  return upcoming ? { label: `به‌زودی: ${upcoming.badgeText ?? upcoming.name}`, scheduled: true } : null
}
