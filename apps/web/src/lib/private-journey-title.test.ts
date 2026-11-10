import { describe, expect, it } from 'vitest'
import { PRIVATE_JOURNEY_DEFAULT_TITLE, privateJourneyTitle } from './private-journey-title'

describe('private journey titles', () => {
  it('names each section instead of one shared account title', () => {
    expect(privateJourneyTitle(['search'])).toBe('جستجو')
    expect(privateJourneyTitle(['cart'])).toBe('سبد خرید')
    expect(privateJourneyTitle(['orders'])).toBe('سفارش‌های من')
    expect(privateJourneyTitle(['account'])).toBe('حساب کاربری')
    expect(privateJourneyTitle(['account', 'invoices'])).toBe('فاکتورهای من')
    expect(privateJourneyTitle(['payment-return'])).toBe('نتیجهٔ پرداخت')
  })
  it('never puts an id or unknown text in the title', () => {
    expect(privateJourneyTitle(['orders', 'cmw6kdezu003xp908zczezp26'])).toBe('سفارش‌های من')
    expect(privateJourneyTitle(['account', 'invoices', 'inv_secret'])).toBe('فاکتورهای من')
    expect(privateJourneyTitle(['account', '<script>'])).toBe('حساب کاربری')
    expect(privateJourneyTitle(['__proto__'])).toBe(PRIVATE_JOURNEY_DEFAULT_TITLE)
    expect(privateJourneyTitle([])).toBe(PRIVATE_JOURNEY_DEFAULT_TITLE)
    expect(privateJourneyTitle(undefined)).toBe(PRIVATE_JOURNEY_DEFAULT_TITLE)
  })
})
