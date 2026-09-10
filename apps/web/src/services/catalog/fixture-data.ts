import type { CatalogProduct, CatalogCategory } from './types'
import type { Money } from '@iranyaragh/contracts'

/**
 * Fixture catalog data used by `CatalogFixtureClient` only.
 *
 * These TEMPORARY, hand-authored records give the storefront a runnable catalog
 * before the API backend lands on `main` (parallel-work model). Prices mirror
 * the existing landing-page prototypes in Rial (a prototype price of e.g.
 * 285000 تومان = 2850000 ریال). The fixture is gated fail-closed and is never a
 * substitute for live catalog data; it is NOT reported as delivered capability.
 */

/** Convert a Toman-styled prototype price to a contract Money (Rial). */
function tomanToMoney(toman: number): Money {
  return { amount: String(Math.trunc(toman * 10)), currency: 'IRR' }
}

function p(partial: Omit<CatalogProduct, 'price' | 'oldPrice'> & { priceToman: number; oldToman?: number }): CatalogProduct {
  return {
    id: partial.id,
    slug: partial.slug,
    name: partial.name,
    brand: partial.brand,
    category: partial.category,
    image: partial.image,
    description: partial.description,
    price: tomanToMoney(partial.priceToman),
    oldPrice: partial.oldToman !== undefined ? tomanToMoney(partial.oldToman) : null,
    rating: partial.rating,
    reviews: partial.reviews,
    stockStatus: partial.stockStatus,
    badge: partial.badge,
  }
}

export const fixtureCatalogCategories: CatalogCategory[] = [
  { id: 'cat-power', name: 'ابزار برقی', slug: 'power-tools', productCount: 320, image: '/images/hero1.jpg' },
  { id: 'cat-hand', name: 'ابزار دستی', slug: 'hand-tools', productCount: 480, image: '/images/tool3.jpg' },
  { id: 'cat-pneumatic', name: 'ابزار بادی', slug: 'pneumatic', productCount: 110, image: '/images/tool2.jpg' },
  { id: 'cat-safety', name: 'ایمنی و کار', slug: 'safety', productCount: 210, image: '/images/hero2.jpg' },
  { id: 'cat-measuring', name: 'اندازه‌گیری', slug: 'measuring', productCount: 95, image: '/images/tool3.jpg' },
  { id: 'cat-garden', name: 'باغبانی', slug: 'garden', productCount: 180, image: '/images/hero2.jpg' },
]

const power = { id: 'cat-power', name: 'ابزار برقی', slug: 'power-tools' }
const hand = { id: 'cat-hand', name: 'ابزار دستی', slug: 'hand-tools' }
const pneumatic = { id: 'cat-pneumatic', name: 'ابزار بادی', slug: 'pneumatic' }
const safety = { id: 'cat-safety', name: 'ایمنی و کار', slug: 'safety' }
const measuring = { id: 'cat-measuring', name: 'اندازه‌گیری', slug: 'measuring' }
const garden = { id: 'cat-garden', name: 'باغبانی', slug: 'garden' }

export const fixtureCatalogProducts: CatalogProduct[] = [
  p({
    id: 'p-101', slug: 'ronix-2210-hammer-drill', name: 'دریل چکشی ۱۳ میلی‌متر رونیکس ۲۲۱۰',
    brand: 'Ronix', category: power, image: '/images/hero1.jpg', priceToman: 2850000, oldToman: 3450000,
    rating: 4.8, reviews: 342, stockStatus: 'IN_STOCK', badge: 'پرفروش هفته',
    description: 'دریل چکشی ۱۳ میلی‌متری با موتور قدرتمند و سرعت متغیر برای سوراخ‌کاری روی فلز، چوب و بتن.',
  }),
  p({
    id: 'p-102', slug: 'bosch-gws-750-grinder', name: 'مینی فرز ۱۱۵ میلی‌متر بوش GWS 750',
    brand: 'Bosch', category: power, image: '/images/tool2.jpg', priceToman: 4200000,
    rating: 4.9, reviews: 189, stockStatus: 'IN_STOCK', badge: 'جدید',
    description: 'مینی فرز ۷۵۰ وات با بدنه باریک و ارگونومیک برای برش و سنگ‌زنی در کارگاه و پروژه.',
  }),
  p({
    id: 'p-103', slug: 'hans-24pc-socket-set', name: 'ست آچار بکس ۲۴ پارچه هنس',
    brand: 'Hans', category: hand, image: '/images/tool3.jpg', priceToman: 1890000, oldToman: 2250000,
    rating: 4.7, reviews: 412, stockStatus: 'IN_STOCK', badge: null,
    description: 'ست آچار بکس ۲۴ پارچه با کیفیت صنعتی و جعبه نگهداری مقاوم.',
  }),
  p({
    id: 'p-104', slug: 'nek-1342-breaker-hammer', name: 'چکش تخریب ۷ کیلویی نک NEK 1342',
    brand: 'Nek', category: power, image: '/images/hero2.jpg', priceToman: 6980000,
    rating: 4.6, reviews: 98, stockStatus: 'LOW_STOCK', badge: 'پیشنهاد ویژه',
    description: 'چکش تخریب ۷ کیلویی با قابلیت تخریب بتن و آجرکاری با ضربه بالا.',
  }),
  p({
    id: 'p-105', slug: 'dewalt-20v-chainsaw', name: 'اره زنجیری شارژی ۲۰ ولت دیوالت',
    brand: 'DeWalt', category: garden, image: '/images/hero1.jpg', priceToman: 8750000, oldToman: 10200000,
    rating: 4.9, reviews: 76, stockStatus: 'OUT_OF_STOCK', badge: 'شارژی',
    description: 'اره زنجیری شارژی ۲۰ ولت برای برش شاخه‌ها و هرس درختان بدون نیاز به کابل.',
  }),
  p({
    id: 'p-106', slug: 'tosan-50l-compressor', name: 'کمپرسور باد ۵۰ لیتری توسن',
    brand: 'Tosan', category: pneumatic, image: '/images/tool2.jpg', priceToman: 5420000,
    rating: 4.5, reviews: 134, stockStatus: 'IN_STOCK', badge: null,
    description: 'کمپرسور باد ۵۰ لیتری با مخزن و موتور قدرتمند برای مصارف کارگاهی.',
  }),
  p({
    id: 'p-201', slug: 'ronix-8101-screwdriver', name: 'پیچ‌گوشتی شارژی ۴ ولت رونیکس ۸۱۰۱',
    brand: 'Ronix', category: power, image: '/images/tool3.jpg', priceToman: 980000, oldToman: 1250000,
    rating: 4.8, reviews: 892, stockStatus: 'IN_STOCK', badge: '٪۲۲ تخفیف',
    description: 'پیچ‌گوشتی شارژی ۴ ولت سبک و جمع‌وجور برای مصارف خانگی و تعمیرات.',
  }),
  p({
    id: 'p-202', slug: 'iran-potk-8in-plier', name: 'انبر دست ۸ اینچ ایران پتک',
    brand: 'Iran Potk', category: hand, image: '/images/hero2.jpg', priceToman: 420000,
    rating: 4.7, reviews: 521, stockStatus: 'IN_STOCK', badge: null,
    description: 'انبر دست ۸ اینچ با فک مقاوم و دسته ارگونومیک.',
  }),
  p({
    id: 'p-203', slug: 'bosch-glm-50-laser', name: 'متر لیزری ۵۰ متری بوش GLM 50',
    brand: 'Bosch', category: measuring, image: '/images/tool2.jpg', priceToman: 3150000,
    rating: 4.9, reviews: 203, stockStatus: 'IN_STOCK', badge: 'دقیق',
    description: 'متر لیزری ۵۰ متری با دقت بالا و صفحه نمایش روشن.',
  }),
  p({
    id: 'p-204', slug: 'safety-pro-cut-gloves', name: 'دستکش ایمنی ضد برش',
    brand: 'Safety Pro', category: safety, image: '/images/hero1.jpg', priceToman: 185000, oldToman: 240000,
    rating: 4.6, reviews: 634, stockStatus: 'IN_STOCK', badge: 'اقتصادی',
    description: 'دستکش ایمنی ضد برش با سطح ۵ محافظت در برابر برش.',
  }),
  p({
    id: 'p-205', slug: 'fiskars-garden-shears', name: 'قیچی باغبانی حرفه‌ای FISKARS',
    brand: 'Fiskars', category: garden, image: '/images/hero2.jpg', priceToman: 765000,
    rating: 4.8, reviews: 178, stockStatus: 'IN_STOCK', badge: null,
    description: 'قیچی باغبانی حرفه‌ای با تیغه فولادی تیز و دسته نرم.',
  }),
  p({
    id: 'p-301', slug: 'ronix-8100k-kit', name: 'ست دریل و پیچ‌گوشتی شارژی رونیکس ۸۱۰۰K',
    brand: 'Ronix', category: power, image: '/images/hero1.jpg', priceToman: 4590000, oldToman: 5890000,
    rating: 4.9, reviews: 267, stockStatus: 'IN_STOCK', badge: 'سری مشکی',
    description: 'ست کامل دریل و پیچ‌گوشتی شارژی با دو باتری و کیف حمل.',
  }),
  p({
    id: 'p-302', slug: 'ronix-rp0140-pressure-washer', name: 'کارواش فشار قوی ۱۴۰ بار رونیکس RP-0140',
    brand: 'Ronix', category: pneumatic, image: '/images/tool3.jpg', priceToman: 3890000,
    rating: 4.7, reviews: 145, stockStatus: 'IN_STOCK', badge: 'قدرتمند',
    description: 'کارواش فشار قوی ۱۴۰ بار برای شست‌وشوی خودرو و سطوح.',
  }),
  p({
    id: 'p-303', slug: 'ronix-5403-sliding-saw', name: 'اره فارسی‌بر کشویی رونیکس ۵۴۰۳',
    brand: 'Ronix', category: power, image: '/images/tool2.jpg', priceToman: 11200000, oldToman: 13500000,
    rating: 4.8, reviews: 89, stockStatus: 'LOW_STOCK', badge: null,
    description: 'اره فارسی‌بر کشویی با برش دقیق و زاویه‌دار برای نجاری.',
  }),
  p({
    id: 'p-304', slug: 'ronix-2701-multitool', name: 'بتون‌کن سه‌کاره رونیکس ۲۷۰۱',
    brand: 'Ronix', category: power, image: '/images/hero2.jpg', priceToman: 5120000,
    rating: 4.9, reviews: 312, stockStatus: 'IN_STOCK', badge: 'SDS Plus',
    description: 'بتون‌کن سه‌کاره با قابلیت دریل، چکش و تخریب.',
  }),
]

export const fixtureAllProducts = fixtureCatalogProducts
