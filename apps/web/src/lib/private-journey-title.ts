/** Browser-tab title of the private (never indexed) account and purchase pages. */
const SECTION_TITLES: Readonly<Record<string, string>> = Object.assign(Object.create(null) as Record<string, string>, {
  search: 'جستجو',
  bestsellers: 'پرفروش‌ها',
  cart: 'سبد خرید',
  checkout: 'تکمیل خرید',
  orders: 'سفارش‌های من',
  payment: 'پرداخت',
  'payment-return': 'نتیجهٔ پرداخت',
  account: 'حساب کاربری',
})
const ACCOUNT_TITLES: Readonly<Record<string, string>> = Object.assign(Object.create(null) as Record<string, string>, {
  invoices: 'فاکتورهای من',
  addresses: 'نشانی‌های من',
  notifications: 'اعلان‌ها',
  security: 'امنیت و نشست‌ها',
  credit: 'حساب اعتباری',
  'custom-doors': 'سفارش‌های درب',
})
export const PRIVATE_JOURNEY_DEFAULT_TITLE = 'حساب و خرید'

/** Only the fixed section names are used: ids, queries and any customer text never reach the title. */
export function privateJourneyTitle(path: readonly string[] | undefined): string {
  const [section, sub] = path ?? []
  if (section === 'account' && sub && ACCOUNT_TITLES[sub]) return ACCOUNT_TITLES[sub]
  return (section && SECTION_TITLES[section]) || PRIVATE_JOURNEY_DEFAULT_TITLE
}
