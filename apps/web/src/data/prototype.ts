// PROTOTYPE DATA (TEMPORARY)
// -----------------------------------------------------------------------------
// These are static mock fixtures from the original prototype. They must NOT be
// treated as a production data contract and vanish as the real API lands
// (see G3-07 "Storefront API integration"). Replace via the typed API client,
// not by growing this file.
// -----------------------------------------------------------------------------
import {
  Award,
  BadgeCheck,
  CreditCard,
  Drill,
  Hammer,
  Headset,
  Leaf,
  Ruler,
  ShieldCheck,
  Truck,
  Wrench,
} from 'lucide-react'
import type { BlogPost, Category, HeroSlide, Product, Service } from '../types/content'

export const heroSlides: HeroSlide[] = [
  {
    id: 1,
    badge: 'جشنواره بزرگ ایران یراق',
    title: 'قدرت را در دست بگیرید',
    highlight: 'با ابزارآلات حرفه‌ای',
    desc: 'بیش از ۱۵۰۰ ابزار برقی و دستی با ضمانت اصالت و ارسال رایگان به سراسر ایران',
    cta: 'مشاهده جشنواره',
    cta2: 'کاتالوگ محصولات',
    image: '/images/hero1.jpg',
    gradient: 'from-[#0F172A]/90 via-[#0F172A]/60 to-transparent',
    accent: '#FF4D00',
  },
  {
    id: 2,
    badge: 'جدید • سری صنعتی',
    title: 'دقت آلمانی، قدرت ایرانی',
    highlight: 'ابزار بوش و رونیکس',
    desc: 'مجموعه کامل دریل، فرز و بتن‌کن با ۱۸ ماه گارانتی تعویض و اقساط بدون بهره',
    cta: 'خرید اقساطی',
    cta2: 'مقایسه محصولات',
    image: '/images/hero2.jpg',
    gradient: 'from-[#7c2d12]/85 via-[#0F172A]/55 to-transparent',
    accent: '#F59E0B',
  },
  {
    id: 3,
    badge: 'تخفیف ویژه باغبانی',
    title: 'بهار در کارگاه شما',
    highlight: 'تا ۳۵٪ تخفیف واقعی',
    desc: 'اره زنجیری، چمن‌زن و ابزار باغبانی شارژی با ارسال ۲۴ ساعته',
    cta: 'شروع خرید',
    cta2: 'مشاوره رایگان',
    image: '/images/tool3.jpg',
    gradient: 'from-[#064e3b]/85 via-[#0F172A]/50 to-transparent',
    accent: '#10b981',
  },
]

export const categories: Category[] = [
  { id: 1, title: 'ابزار برقی', en: 'Power Tools', count: '۳۲۰ کالا', icon: Drill, image: '/images/hero1.jpg', color: 'bg-[#FF4D00]' },
  { id: 2, title: 'ابزار دستی', en: 'Hand Tools', count: '۴۸۰ کالا', icon: Hammer, image: '/images/tool3.jpg', color: 'bg-[#0F172A]' },
  { id: 3, title: 'ابزار بادی', en: 'Pneumatic', count: '۱۱۰ کالا', icon: Wrench, image: '/images/tool2.jpg', color: 'bg-[#F59E0B]' },
  { id: 4, title: 'ایمنی و کار', en: 'Safety', count: '۲۱۰ کالا', icon: ShieldCheck, image: '/images/hero2.jpg', color: 'bg-[#0ea5e9]' },
  { id: 5, title: 'اندازه‌گیری', en: 'Measuring', count: '۹۵ کالا', icon: Ruler, image: '/images/tool3.jpg', color: 'bg-[#10b981]' },
  { id: 6, title: 'باغبانی', en: 'Garden', count: '۱۸۰ کالا', icon: Leaf, image: '/images/hero2.jpg', color: 'bg-[#84cc16]' },
]

export const popularProducts: Product[] = [
  { id: 101, title: 'دریل چکشی ۱۳ میلی‌متر رونیکس ۲۲۱۰', brand: 'Ronix', price: 2850000, oldPrice: 3450000, rating: 4.8, reviews: 342, image: '/images/hero1.jpg', badge: 'پرفروش هفته', cat: 'ابزار برقی' },
  { id: 102, title: 'مینی فرز ۱۱۵ میلی‌متر بوش GWS 750', brand: 'Bosch', price: 4200000, rating: 4.9, reviews: 189, image: '/images/tool2.jpg', badge: 'جدید', cat: 'ابزار برقی' },
  { id: 103, title: 'ست آچار بکس ۲۴ پارچه هنس', brand: 'Hans', price: 1890000, oldPrice: 2250000, rating: 4.7, reviews: 412, image: '/images/tool3.jpg', cat: 'ابزار دستی' },
  { id: 104, title: 'چکش تخریب ۷ کیلویی نک NEK 1342', brand: 'Nek', price: 6980000, rating: 4.6, reviews: 98, image: '/images/hero2.jpg', badge: 'پیشنهاد ویژه', cat: 'ابزار برقی' },
  { id: 105, title: 'اره زنجیری شارژی ۲۰ ولت دیوالت', brand: 'DeWalt', price: 8750000, oldPrice: 10200000, rating: 4.9, reviews: 76, image: '/images/hero1.jpg', badge: 'شارژی', cat: 'باغبانی' },
  { id: 106, title: 'کمپرسور باد ۵۰ لیتری توسن', brand: 'Tosan', price: 5420000, rating: 4.5, reviews: 134, image: '/images/tool2.jpg', cat: 'ابزار بادی' },
]

export const bestSellers: Product[] = [
  { id: 201, title: 'پیچ‌گوشتی شارژی ۴ ولت رونیکس ۸۱۰۱', brand: 'Ronix', price: 980000, oldPrice: 1250000, rating: 4.8, reviews: 892, image: '/images/tool3.jpg', badge: '٪22 تخفیف', cat: 'ابزار برقی' },
  { id: 202, title: 'انبر دست ۸ اینچ ایران پتک', brand: 'Iran Potk', price: 420000, rating: 4.7, reviews: 521, image: '/images/hero2.jpg', cat: 'ابزار دستی' },
  { id: 203, title: 'متر لیزری ۵۰ متری بوش GLM 50', brand: 'Bosch', price: 3150000, rating: 4.9, reviews: 203, image: '/images/tool2.jpg', badge: 'دقیق', cat: 'اندازه‌گیری' },
  { id: 204, title: 'دستکش ایمنی ضد برش', brand: 'Safety Pro', price: 185000, oldPrice: 240000, rating: 4.6, reviews: 634, image: '/images/hero1.jpg', badge: 'اقتصادی', cat: 'ایمنی' },
  { id: 205, title: 'قیچی باغبانی حرفه‌ای FISKARS', brand: 'Fiskars', price: 765000, rating: 4.8, reviews: 178, image: '/images/hero2.jpg', cat: 'باغبانی' },
]

export const specialProducts: Product[] = [
  { id: 301, title: 'ست دریل و پیچ‌گوشتی شارژی رونیکس 8100K', brand: 'Ronix', price: 4590000, oldPrice: 5890000, rating: 4.9, reviews: 267, image: '/images/hero1.jpg', badge: 'سری مشکی', cat: 'رونیکس پرو' },
  { id: 302, title: 'کارواش فشار قوی ۱۴۰ بار رونیکس RP-0140', brand: 'Ronix', price: 3890000, rating: 4.7, reviews: 145, image: '/images/tool3.jpg', badge: 'قدرتمند', cat: 'رونیکس پرو' },
  { id: 303, title: 'اره فارسی‌بر کشویی رونیکس 5403', brand: 'Ronix', price: 11200000, oldPrice: 13500000, rating: 4.8, reviews: 89, image: '/images/tool2.jpg', cat: 'رونیکس پرو' },
  { id: 304, title: 'بتون‌کن ۳ کاره رونیکس 2701', brand: 'Ronix', price: 5120000, rating: 4.9, reviews: 312, image: '/images/hero2.jpg', badge: 'SDS Plus', cat: 'رونیکس پرو' },
]

export const blogPosts: BlogPost[] = [
  { id: 1, title: '۱۰ نکته برای افزایش عمر دریل شارژی', excerpt: 'اگر می‌خواهید باتری دریل شما سال‌ها کار کند، این اشتباهات رایج را هرگز تکرار نکنید...', date: '۱۸ مرداد ۱۴۰۳', read: '۴ دقیقه', image: '/images/tool2.jpg', tag: 'آموزش فنی' },
  { id: 2, title: 'راهنمای خرید مینی فرز: ۷۵۰ وات یا ۲۲۰۰ وات؟', excerpt: 'تفاوت قدرت، وزن و کاربرد هر مدل را به زبان ساده مقایسه کردیم تا انتخاب درستی داشته باشید.', date: '۱۲ مرداد ۱۴۰۳', read: '۶ دقیقه', image: '/images/hero1.jpg', tag: 'راهنمای خرید' },
  { id: 3, title: 'ایمنی در کارگاه: ۵ اشتباهی که حادثه می‌آفریند', excerpt: 'از عینک ایمنی تا دستکش؛ چک‌لیست ضروری هر استادکار قبل از روشن کردن دستگاه.', date: '۵ مرداد ۱۴۰۳', read: '۳ دقیقه', image: '/images/tool3.jpg', tag: 'ایمنی' },
]

export const services: Service[] = [
  { icon: Truck, title: 'ارسال رایگان و فوری', desc: 'برای سفارش‌های بالای ۲ میلیون، ارسال رایگان به سراسر ایران و تحویل ۲۴ ساعته در تهران', color: 'bg-[#FF4D00]' },
  { icon: BadgeCheck, title: 'ضمانت اصالت کالا', desc: 'کلیه ابزارآلات با هولوگرام اصلی و ۱۸ ماه گارانتی شرکتی عرضه می‌شوند', color: 'bg-[#0F172A]' },
  { icon: Headset, title: 'مشاوره تخصصی رایگان', desc: 'کارشناسان فنی ما ۷ روز هفته از ۸ صبح تا ۱۰ شب پاسخگوی شما هستند', color: 'bg-[#F59E0B]' },
  { icon: CreditCard, title: 'پرداخت امن و اقساطی', desc: 'امکان خرید اقساطی بدون ضامن تا ۱۲ ماه با دیجی‌پی و اسنپ‌پی', color: 'bg-[#0ea5e9]' },
]

export const quickStats = [
  { k: 'ضمانت', v: '۱۸ ماه' },
  { k: 'ارسال', v: 'رایگان' },
  { k: 'رضایت', v: '۴.۸/۵' },
]

export const brandStats = [
  { n: '۴۸,۲۳۰', l: 'مشتری راضی' },
  { n: '۴.۸ / ۵', l: 'امتیاز فروشگاه' },
  { n: '۹۸.۲٪', l: 'تحویل به‌موقع' },
  { n: '۲۴ ماه', l: 'گارانتی واقعی' },
]

export const heroTrustPoints = [
  { icon: BadgeCheck, label: 'ضمانت اصالت' },
  { icon: Truck, label: 'ارسال رایگان' },
  { icon: Award, label: '۴.۸ از ۵ • ۱۸۰۰ نظر' },
]

export const brandsRow = ['BOSCH', 'Ronix', 'Tosan', 'DEWALT', 'Makita', 'NEC', 'HANS'] as const