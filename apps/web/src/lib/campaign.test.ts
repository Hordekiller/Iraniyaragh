import { describe, expect, it } from 'vitest'
import type { PublicPromotion } from '@iranyaragh/contracts'
import { campaignBadgeFor } from './campaign'

const promo = (o: Partial<PublicPromotion>): PublicPromotion => ({
  id: 'p', name: 'جشنواره', badgeText: null, kind: 'PERCENTAGE', percentBp: 1000, amount: null,
  startsAt: null, endsAt: null, scheduled: false, targets: [], ...o,
})
const product = { id: 'prod-1', category: { id: 'cat-1', name: 'c', slug: 'c' } }

describe('campaignBadgeFor', () => {
  it('returns nothing without campaigns', () => {
    expect(campaignBadgeFor(product, [])).toBeNull()
  })
  it('uses the administrator text and never invents a percentage', () => {
    expect(campaignBadgeFor(product, [promo({ badgeText: 'پیشنهاد ویژه' })])).toEqual({ label: 'پیشنهاد ویژه', scheduled: false })
    expect(campaignBadgeFor(product, [promo({})])?.label).toBe('جشنواره')
  })
  it('matches exact product and category scopes only', () => {
    expect(campaignBadgeFor(product, [promo({ targets: [{ type: 'PRODUCT', targetId: 'prod-1' }] })])).not.toBeNull()
    expect(campaignBadgeFor(product, [promo({ targets: [{ type: 'CATEGORY', targetId: 'cat-1' }] })])).not.toBeNull()
    expect(campaignBadgeFor(product, [promo({ targets: [{ type: 'PRODUCT', targetId: 'other' }] })])).toBeNull()
    expect(campaignBadgeFor(product, [promo({ targets: [{ type: 'BRAND', targetId: 'b' }] })])).toBeNull()
  })
  it('prefers a live campaign over an upcoming one and labels scheduled ones', () => {
    expect(campaignBadgeFor(product, [promo({ id: 'a', scheduled: true, name: 'بعدی' }), promo({ id: 'b', name: 'اکنون' })])?.label).toBe('اکنون')
    expect(campaignBadgeFor(product, [promo({ scheduled: true, name: 'بعدی' })])).toEqual({ label: 'به‌زودی: بعدی', scheduled: true })
  })
})
