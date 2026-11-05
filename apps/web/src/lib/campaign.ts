import type { PublicPromotion } from '@iranyaragh/contracts'
import type { CatalogProduct } from '../services/catalog/types'

export type CampaignBadge = { label: string; scheduled: boolean }

/**
 * Truthful campaign label for a product card. Only campaigns whose scope can be
 * verified from card data (store-wide, exact product, exact category) produce a
 * badge; brand/SKU-scoped campaigns are omitted rather than guessed. No price
 * or percentage is invented: the label is the administrator's own text.
 */
export function campaignBadgeFor(
  product: Pick<CatalogProduct, 'id' | 'category'>,
  promotions: readonly PublicPromotion[],
): CampaignBadge | null {
  const matches = promotions.filter((promo) => {
    if (promo.targets.length === 0) return true
    return promo.targets.some(
      (t) =>
        (t.type === 'PRODUCT' && t.targetId === product.id) ||
        (t.type === 'CATEGORY' && product.category?.id === t.targetId),
    )
  })
  const live = matches.find((p) => !p.scheduled)
  if (live) return { label: live.badgeText ?? live.name, scheduled: false }
  const upcoming = matches.find((p) => p.scheduled)
  return upcoming ? { label: `به‌زودی: ${upcoming.badgeText ?? upcoming.name}`, scheduled: true } : null
}
