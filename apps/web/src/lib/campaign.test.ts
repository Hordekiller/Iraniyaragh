import { describe, expect, it } from 'vitest'
import type { PublicPromotion } from '@iranyaragh/contracts'
import { campaignBadgeFor } from './campaign'

const promo = (o: Partial<PublicPromotion>): PublicPromotion => ({
  id: 'p', name: 'جشنواره', badgeText: null, kind: 'PERCENTAGE', percentBp: 1000, amount: null,
  startsAt: null, endsAt: null, scheduled: false, scope: { all: true, exceptProductIds: [] }, ...o,
})
const product = { id: 'prod-1' }

describe('campaignBadgeFor', () => {
  it('returns nothing without campaigns', () => {
    expect(campaignBadgeFor(product, [])).toBeNull()
  })
  it('uses the administrator text and never invents a percentage', () => {
    expect(campaignBadgeFor(product, [promo({ badgeText: 'پیشنهاد ویژه' })])).toEqual({ label: 'پیشنهاد ویژه', scheduled: false })
    expect(campaignBadgeFor(product, [promo({})])?.label).toBe('جشنواره')
  })
  it('matches only products the server resolved into scope, and honours store-wide exclusions', () => {
    expect(campaignBadgeFor(product, [promo({ scope: { all: false, productIds: ['prod-1', 'x'] } })])).not.toBeNull()
    expect(campaignBadgeFor(product, [promo({ scope: { all: false, productIds: ['other'] } })])).toBeNull()
    expect(campaignBadgeFor(product, [promo({ scope: { all: true, exceptProductIds: ['prod-1'] } })])).toBeNull()
    expect(campaignBadgeFor(product, [promo({ scope: { all: true, exceptProductIds: ['other'] } })])).not.toBeNull()
  })
  it('prefers a live campaign over an upcoming one and labels scheduled ones', () => {
    expect(campaignBadgeFor(product, [promo({ id: 'a', scheduled: true, name: 'بعدی' }), promo({ id: 'b', name: 'اکنون' })])?.label).toBe('اکنون')
    expect(campaignBadgeFor(product, [promo({ scheduled: true, name: 'بعدی' })])).toEqual({ label: 'به‌زودی: بعدی', scheduled: true })
  })
})
