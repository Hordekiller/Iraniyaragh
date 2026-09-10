import { categories } from '../data/prototype'
import { toPersianDigits } from './format'

/**
 * Single source of truth for site-wide business constants, contact info,
 * policy values and section anchor IDs. Every component references these
 * constants instead of hardcoding values — one place to update, no stale data.
 */

// ── Contact & identity ───────────────────────────────────────────────────────

export const SITE_NAME = 'ایران یراق'
export const SITE_FOUNDING_YEAR = 1385
export const SITE_TAGLINE = `ARAD TOOLS • از ${toPersianDigits(SITE_FOUNDING_YEAR)}`

export const PHONE_MAIN = '۰۲۱-۸۸۸۸۸۸۸۸'
export const PHONE_SECONDARY = '۰۲۱-۶۶۷۰۰۰۰۰'
export const EMAIL = 'info@aradtools.ir'
export const INSTAGRAM_HANDLE = 'aradtools.ir'
export const INSTAGRAM_URL = `https://www.instagram.com/${INSTAGRAM_HANDLE}`

export const ADDRESS_SHORT = 'تهران، خیابان امام خمینی، پاساژ ابزار'
export const ADDRESS_FULL = 'تهران، خیابان امام خمینی، نرسیده به حسن‌آباد، مرکز فروش ایران یراق، طبقه همکف، پلاک ۴۲'

export const WORKING_HOURS = 'شنبه تا پنجشنبه ۸ تا ۲۰'
export const SUPPORT_HOURS = 'پشتیبانی تا ۱۰ شب • حتی جمعه‌ها'

// ── Newsletter & brand presence ──────────────────────────────────────────────

/** Discount code value (Toman) promised to newsletter subscribers. */
export const NEWSLETTER_DISCOUNT_TOMAN = 150_000
/** Total distinct tool brands carried by the shop (shown in the marquee). */
export const TOTAL_BRAND_COUNT = 39
/** Product catalogue size advertised in the header search placeholder. */
export const CATALOG_PRODUCT_COUNT = 2500

// ── Shipping policy ──────────────────────────────────────────────────────────

/** Free-shipping threshold in Toman. */
export const FREE_SHIPPING_THRESHOLD_TOMAN = 2_000_000
/** Standard shipping cost in Toman. */
export const SHIPPING_COST_TOMAN = 45_000
/** Threshold in Rial (Toman × 10). */
export const FREE_SHIPPING_THRESHOLD_RIALS = FREE_SHIPPING_THRESHOLD_TOMAN * 10
/** Shipping cost in Rial (Toman × 10). */
export const SHIPPING_COST_RIALS = SHIPPING_COST_TOMAN * 10

/** Same-day delivery promo banner (popular-tools strip). */
export const DELIVERY_PROMO = {
  title: 'ارسال امروز اگر تا ۲ ساعت دیگر سفارش دهید',
  subtitle: 'تهران و کرج • تحویل درب منزل',
} as const

// ── Special collection (Ronix PRO) ───────────────────────────────────────────

/** Marketing copy for the home "special collection" banner. */
export const SPECIAL_COLLECTION = {
  title: 'سری مشکی رونیکس',
  subtitle: 'RONIX PRO • ابزار دسته‌بندی خاص',
  description: 'کلکسیون ابزار صنعتی مشکی مات با موتور براشلس و گارانتی ۲۴ ماهه — انتخاب حرفه‌ای‌ها',
} as const

// ── Login dialog ─────────────────────────────────────────────────────────────

/** Mobile-number placeholder shown while logging in. */
export const MOBILE_PLACEHOLDER = '۰۹۱۲ ۳۴۵ ۶۷۸۹'

// ── Section anchor IDs ───────────────────────────────────────────────────────

export const SECTION_IDS = {
  home: 'home',
  categories: 'categories',
  popular: 'popular',
  bestseller: 'bestseller',
  blog: 'blog',
  services: 'services',
  mainContent: 'main-content',
} as const

// ── Category filter pills (derived from prototype categories) ────────────────

export const ALL_FILTER_PILL = 'همه' as const

/** Filter pills for the popular-tools section, derived from category data. */
export const FILTER_PILLS: readonly string[] = [
  ALL_FILTER_PILL,
  ...categories.map(c => c.title),
] as const

// ── Promo card (home hero sidebar) ───────────────────────────────────────────

export const HERO_PROMO = {
  label: 'پیشنهاد امروز',
  badge: 'حراج',
  productName: 'دریل بتن‌کن رونیکس 2701 + هدیه',
  image: '/images/tool2.jpg',
  rating: 4.9,
  reviews: 212,
  price: 5_120_000,
  oldPrice: 6_400_000,
  soldPercent: 68,
  remainingQty: 32,
} as const
