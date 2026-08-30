import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search, Home, User, MessageCircle, LayoutGrid,
  Hammer, Drill, Wrench, ShieldCheck, Ruler, Leaf,
  Star, ChevronLeft, ChevronRight, Play, ArrowLeft,
  Truck, BadgeCheck, Headset, CreditCard, Clock3,
  Menu, X, Phone, MapPin, Mail, Instagram, Send,
  Award, Flame, Zap, ArrowUpLeft
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

// Types
type Product = {
  id: number
  title: string
  brand: string
  price: number
  oldPrice?: number
  rating: number
  reviews: number
  image: string
  badge?: string
  cat: string
}

type Category = {
  id: number
  title: string
  en: string
  count: string
  icon: LucideIcon
  image: string
  color: string
}

const heroSlides = [
  {
    id: 1,
    badge: "جشنواره بزرگ ایران یراق",
    title: "قدرت را در دست بگیرید",
    highlight: "با ابزارآلات حرفه‌ای",
    desc: "بیش از ۱۵۰۰ ابزار برقی و دستی با ضمانت اصالت و ارسال رایگان به سراسر ایران",
    cta: "مشاهده جشنواره",
    cta2: "کاتالوگ محصولات",
    image: "/images/hero1.jpg",
    gradient: "from-[#0F172A]/90 via-[#0F172A]/60 to-transparent",
    accent: "#FF4D00"
  },
  {
    id: 2,
    badge: "جدید • سری صنعتی",
    title: "دقت آلمانی، قدرت ایرانی",
    highlight: "ابزار بوش و رونیکس",
    desc: "مجموعه کامل دریل، فرز و بتن‌کن با ۱۸ ماه گارانتی تعویض و اقساط بدون بهره",
    cta: "خرید اقساطی",
    cta2: "مقایسه محصولات",
    image: "/images/hero2.jpg",
    gradient: "from-[#7c2d12]/85 via-[#0F172A]/55 to-transparent",
    accent: "#F59E0B"
  },
  {
    id: 3,
    badge: "تخفیف ویژه باغبانی",
    title: "بهار در کارگاه شما",
    highlight: "تا ۳۵٪ تخفیف واقعی",
    desc: "اره زنجیری، چمن‌زن و ابزار باغبانی شارژی با ارسال ۲۴ ساعته",
    cta: "شروع خرید",
    cta2: "مشاوره رایگان",
    image: "/images/tool3.jpg",
    gradient: "from-[#064e3b]/85 via-[#0F172A]/50 to-transparent",
    accent: "#10b981"
  },
]

const categories: Category[] = [
  { id: 1, title: "ابزار برقی", en: "Power Tools", count: "۳۲۰ کالا", icon: Drill, image: "/images/hero1.jpg", color: "bg-[#FF4D00]" },
  { id: 2, title: "ابزار دستی", en: "Hand Tools", count: "۴۸۰ کالا", icon: Hammer, image: "/images/tool3.jpg", color: "bg-[#0F172A]" },
  { id: 3, title: "ابزار بادی", en: "Pneumatic", count: "۱۱۰ کالا", icon: Wrench, image: "/images/tool2.jpg", color: "bg-[#F59E0B]" },
  { id: 4, title: "ایمنی و کار", en: "Safety", count: "۲۱۰ کالا", icon: ShieldCheck, image: "/images/hero2.jpg", color: "bg-[#0ea5e9]" },
  { id: 5, title: "اندازه‌گیری", en: "Measuring", count: "۹۵ کالا", icon: Ruler, image: "/images/tool3.jpg", color: "bg-[#10b981]" },
  { id: 6, title: "باغبانی", en: "Garden", count: "۱۸۰ کالا", icon: Leaf, image: "/images/hero2.jpg", color: "bg-[#84cc16]" },
]

const popularProducts: Product[] = [
  { id: 101, title: "دریل چکشی ۱۳ میلی‌متر رونیکس ۲۲۱۰", brand: "Ronix", price: 2850000, oldPrice: 3450000, rating: 4.8, reviews: 342, image: "/images/hero1.jpg", badge: "پرفروش هفته", cat: "ابزار برقی" },
  { id: 102, title: "مینی فرز ۱۱۵ میلی‌متر بوش GWS 750", brand: "Bosch", price: 4200000, rating: 4.9, reviews: 189, image: "/images/tool2.jpg", badge: "جدید", cat: "ابزار برقی" },
  { id: 103, title: "ست آچار بکس ۲۴ پارچه هنس", brand: "Hans", price: 1890000, oldPrice: 2250000, rating: 4.7, reviews: 412, image: "/images/tool3.jpg", cat: "ابزار دستی" },
  { id: 104, title: "چکش تخریب ۷ کیلویی نک NEK 1342", brand: "Nek", price: 6980000, rating: 4.6, reviews: 98, image: "/images/hero2.jpg", badge: "پیشنهاد ویژه", cat: "ابزار برقی" },
  { id: 105, title: "اره زنجیری شارژی ۲۰ ولت دیوالت", brand: "DeWalt", price: 8750000, oldPrice: 10200000, rating: 4.9, reviews: 76, image: "/images/hero1.jpg", badge: "شارژی", cat: "باغبانی" },
  { id: 106, title: "کمپرسور باد ۵۰ لیتری توسن", brand: "Tosan", price: 5420000, rating: 4.5, reviews: 134, image: "/images/tool2.jpg", cat: "ابزار بادی" },
]

const bestSellers: Product[] = [
  { id: 201, title: "پیچ‌گوشتی شارژی ۴ ولت رونیکس ۸۱۰۱", brand: "Ronix", price: 980000, oldPrice: 1250000, rating: 4.8, reviews: 892, image: "/images/tool3.jpg", badge: "٪22 تخفیف", cat: "ابزار برقی" },
  { id: 202, title: "انبر دست ۸ اینچ ایران پتک", brand: "Iran Potk", price: 420000, rating: 4.7, reviews: 521, image: "/images/hero2.jpg", cat: "ابزار دستی" },
  { id: 203, title: "متر لیزری ۵۰ متری بوش GLM 50", brand: "Bosch", price: 3150000, rating: 4.9, reviews: 203, image: "/images/tool2.jpg", badge: "دقیق", cat: "اندازه‌گیری" },
  { id: 204, title: "دستکش ایمنی ضد برش", brand: "Safety Pro", price: 185000, oldPrice: 240000, rating: 4.6, reviews: 634, image: "/images/hero1.jpg", badge: "اقتصادی", cat: "ایمنی" },
  { id: 205, title: "قیچی باغبانی حرفه‌ای FISKARS", brand: "Fiskars", price: 765000, rating: 4.8, reviews: 178, image: "/images/hero2.jpg", cat: "باغبانی" },
]

const specialProducts: Product[] = [
  { id: 301, title: "ست دریل و پیچ‌گوشتی شارژی رونیکس 8100K", brand: "Ronix", price: 4590000, oldPrice: 5890000, rating: 4.9, reviews: 267, image: "/images/hero1.jpg", badge: "سری مشکی", cat: "رونیکس پرو" },
  { id: 302, title: "کارواش فشار قوی ۱۴۰ بار رونیکس RP-0140", brand: "Ronix", price: 3890000, rating: 4.7, reviews: 145, image: "/images/tool3.jpg", badge: "قدرتمند", cat: "رونیکس پرو" },
  { id: 303, title: "اره فارسی‌بر کشویی رونیکس 5403", brand: "Ronix", price: 11200000, oldPrice: 13500000, rating: 4.8, reviews: 89, image: "/images/tool2.jpg", cat: "رونیکس پرو" },
  { id: 304, title: "بتون‌کن ۳ کاره رونیکس 2701", brand: "Ronix", price: 5120000, rating: 4.9, reviews: 312, image: "/images/hero2.jpg", badge: "SDS Plus", cat: "رونیکس پرو" },
]

const blogPosts = [
  { id: 1, title: "۱۰ نکته برای افزایش عمر دریل شارژی", excerpt: "اگر می‌خواهید باتری دریل شما سال‌ها کار کند، این اشتباهات رایج را هرگز تکرار نکنید...", date: "۱۸ مرداد ۱۴۰۳", read: "۴ دقیقه", image: "/images/tool2.jpg", tag: "آموزش فنی" },
  { id: 2, title: "راهنمای خرید مینی فرز: ۷۵۰ وات یا ۲۲۰۰ وات؟", excerpt: "تفاوت قدرت، وزن و کاربرد هر مدل را به زبان ساده مقایسه کردیم تا انتخاب درستی داشته باشید.", date: "۱۲ مرداد ۱۴۰۳", read: "۶ دقیقه", image: "/images/hero1.jpg", tag: "راهنمای خرید" },
  { id: 3, title: "ایمنی در کارگاه: ۵ اشتباهی که حادثه می‌آفریند", excerpt: "از عینک ایمنی تا دستکش؛ چک‌لیست ضروری هر استادکار قبل از روشن کردن دستگاه.", date: "۵ مرداد ۱۴۰۳", read: "۳ دقیقه", image: "/images/tool3.jpg", tag: "ایمنی" },
]

const services = [
  { icon: Truck, title: "ارسال رایگان و فوری", desc: "برای سفارش‌های بالای ۲ میلیون، ارسال رایگان به سراسر ایران و تحویل ۲۴ ساعته در تهران", color: "bg-[#FF4D00]" },
  { icon: BadgeCheck, title: "ضمانت اصالت کالا", desc: "کلیه ابزارآلات با هولوگرام اصلی و ۱۸ ماه گارانتی شرکتی عرضه می‌شوند", color: "bg-[#0F172A]" },
  { icon: Headset, title: "مشاوره تخصصی رایگان", desc: "کارشناسان فنی ما ۷ روز هفته از ۸ صبح تا ۱۰ شب پاسخگوی شما هستند", color: "bg-[#F59E0B]" },
  { icon: CreditCard, title: "پرداخت امن و اقساطی", desc: "امکان خرید اقساطی بدون ضامن تا ۱۲ ماه با دیجی‌پی و اسنپ‌پی", color: "bg-[#0ea5e9]" },
]

export default function App() {
  const [activeSlide, setActiveSlide] = useState(0)
  const [toast, setToast] = useState<string | null>(null)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [mobileNav, setMobileNav] = useState('home')
  const [searchQuery, setSearchQuery] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [activeCategory, setActiveCategory] = useState<string>('همه')
  const popularRef = useRef<HTMLDivElement>(null)
  const bestRef = useRef<HTMLDivElement>(null)
  const specialRef = useRef<HTMLDivElement>(null)

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(()=>setToast(null), 2500)
  }

  useEffect(()=>{
    const id = setInterval(()=> setActiveSlide(s=> (s+1)%3), 5000)
    return ()=> clearInterval(id)
  },[])

  const scroll = (ref: React.RefObject<HTMLDivElement | null>, dir: 'left'|'right') => {
    if(!ref.current) return
    const amount = 340
    ref.current.scrollBy({ left: dir==='left' ? -amount : amount, behavior: 'smooth'})
  }

  const filteredPopular = activeCategory==='همه' ? popularProducts : popularProducts.filter(p=>p.cat===activeCategory)

  return (
    <div className="min-h-screen bg-[#0a0f1e] text-slate-800" style={{fontFamily: 'Vazirmatn, system-ui, sans-serif'}} dir="rtl">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;700;800;900&display=swap');`}</style>

      {/* Top Bar */}
      <div className="hidden lg:block bg-[#070b18] text-white/80 text-[12.5px] border-b border-white/5">
        <div className="max-w-[1280px] mx-auto px-6 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <span className="flex items-center gap-2"><Phone size={14} className="text-[#FF4D00]"/> ۰۲۱-۸۸۸۸۸۸۸۸</span>
            <span className="flex items-center gap-2"><MapPin size={14} className="text-[#FF4D00]"/> تهران، خیابان امام خمینی، پاساژ ابزار</span>
            <span className="flex items-center gap-2"><Clock3 size={14} className="text-[#FF4D00]"/> شنبه تا پنجشنبه ۸ تا ۲۰</span>
          </div>
          <div className="flex items-center gap-5">
            <span className="flex items-center gap-2">پیگیری سفارش</span>
            <span className="w-px h-3 bg-white/20"/>
            <span className="flex items-center gap-2"><Instagram size={14}/> ایران یراق در اینستاگرام</span>
          </div>
        </div>
      </div>

      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-xl border-b border-slate-100">
        <div className="max-w-[1280px] mx-auto px-4 lg:px-6">
          <div className="flex items-center gap-4 lg:gap-8 h-[64px] lg:h-[76px]">
            {/* Logo */}
            <div className="flex items-center gap-3 shrink-0">
              <div className="w-10 h-10 lg:w-11 lg:h-11 rounded-xl bg-[#FF4D00] flex items-center justify-center text-white font-black text-xl leading-none rotate-3">
                <span className="-rotate-3">آ</span>
              </div>
              <div>
                <div className="font-black text-[17px] lg:text-[19px] leading-none text-[#0F172A] tracking-tight">ایران یراق</div>
                <div className="text-[11px] text-slate-500 font-medium tracking-widest">ARAD TOOLS • از ۱۳۸۵</div>
              </div>
              <span className="hidden lg:inline-flex mr-4 px-2.5 py-1 rounded-full bg-[#FF4D00]/10 text-[#FF4D00] text-[11px] font-bold">فروشگاه تخصصی</span>
            </div>

            {/* Nav - Desktop */}
            <nav className="hidden lg:flex items-center gap-7 mr-6 text-[14px] font-medium text-slate-700">
              <a href="#home" className="text-[#FF4D00] font-bold flex items-center gap-1">خانه <span className="w-1.5 h-1.5 rounded-full bg-[#FF4D00]"/></a>
              <a href="#categories" className="hover:text-[#FF4D00] transition">دسته‌بندی‌ها</a>
              <a href="#popular" className="hover:text-[#FF4D00] transition">محبوب‌ها</a>
              <a href="#bestseller" className="hover:text-[#FF4D00] transition">پرفروش‌ها</a>
              <a href="#blog" className="hover:text-[#FF4D00] transition flex items-center gap-1">مجله آموزشی <span className="px-1.5 py-0.5 rounded bg-emerald-500 text-white text-[10px] font-bold">جدید</span></a>
              <a href="#services" className="hover:text-[#FF4D00] transition">خدمات</a>
            </nav>

            {/* Search - Desktop */}
            <div className="hidden lg:flex items-center flex-1 max-w-[420px] mr-auto">
              <div className="relative w-full">
                <input
                  value={searchQuery}
                  onChange={e=>setSearchQuery(e.target.value)}
                  placeholder="جستجو در ۲۵۰۰+ ابزار ... مثلا : دریل رونیکس"
                  className="w-full h-11 pr-11 pl-4 bg-slate-50 border border-slate-200 rounded-full text-[13.5px] placeholder:text-slate-400 focus:outline-none focus:border-[#FF4D00]/40 focus:bg-white focus:ring-4 focus:ring-[#FF4D00]/10 transition"
                />
                <Search size={18} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400"/>
                {searchQuery && (
                  <button onClick={()=>setSearchQuery('')} className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-slate-900 text-white flex items-center justify-center"><X size={14}/></button>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 mr-auto lg:mr-0">
              <button onClick={()=>setShowSearch(!showSearch)} className="lg:hidden w-10 h-10 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center"><Search size={18}/></button>
              <button onClick={()=>showToast('تماس: ۰۲۱-۸۸۸۸۸۸۸۸')} className="hidden lg:flex items-center gap-2 h-11 px-5 rounded-full bg-[#0F172A] text-white text-[13px] font-bold hover:bg-black transition">
                <Phone size={16}/> مشاوره خرید
              </button>
              <button onClick={()=>showToast('ورود به حساب کاربری')} className="w-10 h-10 lg:w-11 lg:h-11 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center hover:bg-white hover:border-[#FF4D00]/30 hover:text-[#FF4D00] transition">
                <User size={18}/>
              </button>
              <button className="lg:hidden w-10 h-10 rounded-full bg-slate-900 text-white flex items-center justify-center" onClick={()=>showToast('منو')}>
                <Menu size={18}/>
              </button>
            </div>
          </div>

          {/* Mobile Search Expand */}
          <AnimatePresence>
            {showSearch && (
              <motion.div initial={{height:0, opacity:0}} animate={{height:'auto', opacity:1}} exit={{height:0, opacity:0}} className="lg:hidden overflow-hidden">
                <div className="pb-4">
                  <div className="relative">
                    <input autoFocus value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} placeholder="جستجوی ابزار..." className="w-full h-12 pr-11 pl-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:border-[#FF4D00]"/>
                    <Search size={18} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400"/>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </header>

      {/* HERO SLIDER */}
      <section id="home" className="max-w-[1280px] mx-auto px-4 lg:px-6 pt-4 lg:pt-6">
        <div className="relative overflow-hidden rounded-[24px] lg:rounded-[28px] bg-[#0F172A] h-[480px] lg:h-[520px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeSlide}
              initial={{ opacity: 0, scale: 1.02 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.7, ease: "easeOut" }}
              className="absolute inset-0"
            >
              <img src={heroSlides[activeSlide].image} alt="" className="absolute inset-0 w-full h-full object-cover"/>
              <div className={`absolute inset-0 bg-gradient-to-l ${heroSlides[activeSlide].gradient}`}/>
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent lg:from-black/30"/>
            </motion.div>
          </AnimatePresence>

          {/* Hero Content */}
          <div className="relative h-full flex flex-col justify-center px-6 lg:px-14 py-10 lg:py-0">
            <motion.div
              key={'content-'+activeSlide}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25, duration: 0.6 }}
              className="max-w-[620px]"
            >
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/15 backdrop-blur-md border border-white/20 text-white text-xs font-bold">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"/> {heroSlides[activeSlide].badge}
              </span>
              <h1 className="mt-4 text-white font-black leading-[1.05] text-[30px] lg:text-[48px]">
                {heroSlides[activeSlide].title}
                <span className="block text-white/90 font-extrabold text-[24px] lg:text-[36px] mt-1">{heroSlides[activeSlide].highlight}</span>
              </h1>
              <p className="mt-4 text-white/85 text-[13.5px] lg:text-[15px] leading-7 max-w-[520px] font-medium">
                {heroSlides[activeSlide].desc}
              </p>
              <div className="flex flex-wrap gap-3 mt-7">
                <button onClick={()=>showToast('رفتن به جشنواره')} className="h-12 px-7 rounded-full bg-[#FF4D00] text-white font-extrabold text-sm hover:bg-[#e64500] transition flex items-center gap-2 shadow-lg shadow-[#FF4D00]/25">
                  {heroSlides[activeSlide].cta} <ArrowLeft size={18} className="bg-white/20 rounded-full p-0.5"/>
                </button>
                <button onClick={()=>showToast('دانلود کاتالوگ')} className="h-12 px-6 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-white font-bold text-sm hover:bg-white hover:text-slate-900 transition flex items-center gap-2">
                  <Play size={16} className="fill-current"/> {heroSlides[activeSlide].cta2}
                </button>
              </div>
              <div className="hidden lg:flex items-center gap-6 mt-8 text-white/90 text-xs">
                <span className="flex items-center gap-2"><BadgeCheck size={16} className="text-emerald-400"/> ضمانت اصالت</span>
                <span className="flex items-center gap-2"><Truck size={16} className="text-emerald-400"/> ارسال رایگان</span>
                <span className="flex items-center gap-2"><Award size={16} className="text-emerald-400"/> ۴.۸ از ۵ • ۱۸۰۰ نظر</span>
              </div>
            </motion.div>
          </div>

          {/* Slider Controls */}
          <div className="absolute bottom-6 right-6 lg:right-auto lg:left-6 flex items-center gap-3">
            <div className="hidden lg:flex items-center gap-2 bg-black/25 backdrop-blur-xl border border-white/15 rounded-full p-1.5">
              <button onClick={()=>setActiveSlide(s=> (s-1+3)%3)} className="w-9 h-9 rounded-full bg-white text-slate-900 flex items-center justify-center hover:bg-slate-100 transition"><ChevronRight size={18}/></button>
              <button onClick={()=>setActiveSlide(s=> (s+1)%3)} className="w-9 h-9 rounded-full bg-white text-slate-900 flex items-center justify-center hover:bg-slate-100 transition"><ChevronLeft size={18}/></button>
            </div>
            <div className="flex items-center gap-2 bg-black/30 backdrop-blur-md rounded-full px-3 py-2">
              {[0,1,2].map(i=>(
                <button key={i} onClick={()=>setActiveSlide(i)} className={`transition-all duration-300 ${activeSlide===i ? 'w-8 h-2.5 bg-[#FF4D00] rounded-full' : 'w-2.5 h-2.5 bg-white/50 rounded-full hover:bg-white'}`}/>
              ))}
              <span className="mr-2 text-white/90 text-xs font-bold tabular-nums">۰{activeSlide+1} / ۰۳</span>
            </div>
          </div>

          {/* Left Promo Card - Desktop */}
          <div className="hidden lg:block absolute top-6 left-6 w-[300px]">
            <div className="rounded-[20px] bg-white p-4 shadow-2xl">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500">پیشنهاد امروز</span>
                <span className="px-2.5 py-1 rounded-full bg-red-500 text-white text-[11px] font-black flex items-center gap-1"><Flame size={12}/> حراج</span>
              </div>
              <div className="flex gap-3 mt-3">
                <img src="/images/tool2.jpg" className="w-20 h-20 rounded-2xl object-cover bg-slate-50"/>
                <div className="flex-1">
                  <div className="text-[13px] font-bold leading-5 text-slate-900 line-clamp-2">دریل بتن‌کن رونیکس 2701 + هدیه</div>
                  <div className="flex items-center gap-1 mt-1"><Star size={12} className="fill-amber-400 text-amber-400"/><span className="text-xs font-bold">۴.۹</span><span className="text-xs text-slate-400">(۲۱۲)</span></div>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-[#FF4D00] font-black text-[15px]">۵,۱۲۰,۰۰۰</span><span className="text-xs text-slate-400 line-through">۶,۴۰۰,۰۰۰</span>
                  </div>
                </div>
              </div>
              <div className="mt-3 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full w-[68%] bg-[#FF4D00] rounded-full"/>
              </div>
              <div className="flex justify-between mt-1.5 text-[11px] font-medium text-slate-500"><span>فروخته شده ۶۸٪</span><span>باقی‌مانده ۳۲ عدد</span></div>
            </div>
          </div>
        </div>

        {/* Tiny Stats under hero - mobile */}
        <div className="grid grid-cols-3 gap-2 mt-3 lg:hidden">
          {[
            {k:"ضمانت", v:"۱۸ ماه"},
            {k:"ارسال", v:"رایگان"},
            {k:"رضایت", v:"۴.۸/۵"},
          ].map(s=>(
            <div key={s.k} className="bg-white rounded-2xl py-3 text-center border border-slate-100">
              <div className="text-[11px] text-slate-500 font-medium">{s.k}</div>
              <div className="text-[13px] font-black text-slate-900">{s.v}</div>
            </div>
          ))}
        </div>
      </section>

      {/* CATEGORIES */}
      <section id="categories" className="max-w-[1280px] mx-auto px-4 lg:px-6 mt-8 lg:mt-10">
        <div className="flex items-end justify-between">
          <div>
            <div className="inline-flex items-center gap-2 text-[11px] font-black tracking-widest text-[#FF4D00]">CATEGORIES <span className="w-8 h-px bg-[#FF4D00]"/></div>
            <h2 className="text-[22px] lg:text-[28px] font-black text-white leading-none mt-2">دسته‌بندی تخصصی ابزار</h2>
            <p className="text-white/60 text-[13px] mt-2">هر آنچه یک استادکار حرفه‌ای نیاز دارد، یک‌جا</p>
          </div>
          <button onClick={()=>showToast('مشاهده همه دسته‌ها')} className="hidden lg:flex items-center gap-2 h-10 px-5 rounded-full bg-white text-slate-900 font-bold text-sm hover:bg-slate-50 transition">همه دسته‌ها <ArrowLeft size={16}/></button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 lg:gap-4 mt-6">
          {categories.map(cat=>{
            const Icon = cat.icon
            return (
              <button key={cat.id} onClick={()=>showToast(`ورود به ${cat.title}`)} className="group relative overflow-hidden rounded-[20px] lg:rounded-[24px] bg-white p-4 lg:p-5 text-right hover:shadow-xl hover:shadow-black/10 transition-all duration-300 hover:-translate-y-1 border border-white">
                <div className={`absolute -left-6 -top-6 w-24 h-24 rounded-full ${cat.color} opacity-[0.08] group-hover:opacity-[0.14] transition`}/>
                <div className={`w-12 h-12 rounded-2xl ${cat.color} text-white flex items-center justify-center shadow-lg`}>
                  <Icon size={22}/>
                </div>
                <div className="mt-3 lg:mt-4 font-black text-slate-900 text-[14px] lg:text-[15px] leading-none">{cat.title}</div>
                <div className="text-[11px] text-slate-400 font-bold tracking-widest mt-1">{cat.en}</div>
                <div className="inline-flex mt-3 px-2.5 py-1 rounded-full bg-slate-900 text-white text-[11px] font-bold">{cat.count}</div>
                <div className="absolute bottom-3 left-3 w-8 h-8 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center group-hover:bg-[#FF4D00] group-hover:text-white group-hover:border-[#FF4D00] transition">
                  <ArrowUpLeft size={16}/>
                </div>
              </button>
            )
          })}
        </div>
      </section>

      {/* POPULAR TOOLS CAROUSEL */}
      <section id="popular" className="max-w-[1280px] mx-auto px-4 lg:px-6 mt-10">
        <div className="bg-white rounded-[24px] lg:rounded-[28px] p-4 lg:p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-11 h-11 rounded-2xl bg-[#FF4D00] text-white flex items-center justify-center"><Flame size={22}/></div>
              <div>
                <h3 className="font-black text-[18px] lg:text-[20px] leading-none text-slate-900">ابزار محبوب هفته</h3>
                <p className="text-slate-500 text-xs lg:text-[13px] mt-1">منتخب استادکاران بر اساس خرید واقعی</p>
              </div>
              <span className="hidden lg:inline-flex mr-4 px-3 py-1.5 rounded-full bg-amber-50 text-amber-600 text-xs font-black border border-amber-200">🔥 داغ‌ترین‌ها</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="hidden lg:flex items-center gap-1.5 p-1 bg-slate-100 rounded-full">
                {['همه','ابزار برقی','ابزار دستی','باغبانی'].map(c=>(
                  <button key={c} onClick={()=>setActiveCategory(c)} className={`px-4 py-2 rounded-full text-xs font-bold transition ${activeCategory===c ? 'bg-[#0F172A] text-white shadow' : 'text-slate-600 hover:text-slate-900'}`}>{c}</button>
                ))}
              </div>
              <div className="flex gap-1.5">
                <button onClick={()=>scroll(popularRef,'right')} className="w-9 h-9 rounded-full border border-slate-200 flex items-center justify-center hover:bg-slate-900 hover:text-white hover:border-slate-900 transition"><ChevronRight size={18}/></button>
                <button onClick={()=>scroll(popularRef,'left')} className="w-9 h-9 rounded-full border border-slate-200 flex items-center justify-center hover:bg-slate-900 hover:text-white hover:border-slate-900 transition"><ChevronLeft size={18}/></button>
              </div>
            </div>
          </div>

          {/* Mobile filter pills */}
          <div className="flex lg:hidden gap-2 mt-4 overflow-x-auto scrollbar-none pb-1">
            {['همه','ابزار برقی','ابزار دستی','باغبانی'].map(c=>(
              <button key={c} onClick={()=>setActiveCategory(c)} className={`shrink-0 px-4 py-2 rounded-full text-xs font-bold border transition ${activeCategory===c ? 'bg-[#0F172A] text-white border-[#0F172A]' : 'bg-white text-slate-700 border-slate-200'}`}>{c}</button>
            ))}
          </div>

          <div ref={popularRef} className="flex gap-3 lg:gap-4 overflow-x-auto scrollbar-none scroll-smooth snap-x snap-mandatory mt-5 pb-2 -mx-1 px-1">
            {filteredPopular.map(p=>(
              <div key={p.id} onClick={()=>setSelectedProduct(p)} className="snap-start shrink-0 w-[172px] lg:w-[210px] bg-slate-50 rounded-[20px] lg:rounded-[24px] p-3 lg:p-3.5 border border-slate-100 hover:border-[#FF4D00]/20 hover:shadow-lg hover:shadow-[#FF4D00]/5 transition cursor-pointer group">
                <div className="relative rounded-2xl overflow-hidden bg-white h-[148px] lg:h-[168px] flex items-center justify-center">
                  <img src={p.image} alt={p.title} className="w-full h-full object-cover group-hover:scale-105 transition duration-500"/>
                  {p.badge && <span className="absolute top-2 right-2 px-2 py-1 rounded-full bg-[#FF4D00] text-white text-[10px] font-black">{p.badge}</span>}
                  <span className="absolute bottom-2 left-2 w-7 h-7 rounded-full bg-white shadow flex items-center justify-center text-slate-600"><Zap size={14} className="text-amber-500"/></span>
                </div>
                <div className="mt-3">
                  <div className="text-[11px] font-bold text-slate-400 tracking-widest">{p.brand}</div>
                  <div className="text-[13px] font-bold leading-5 text-slate-900 line-clamp-2 min-h-[40px]">{p.title}</div>
                  <div className="flex items-center gap-1 mt-1.5">
                    <div className="flex"><Star size={12} className="fill-amber-400 text-amber-400"/><Star size={12} className="fill-amber-400 text-amber-400"/><Star size={12} className="fill-amber-400 text-amber-400"/><Star size={12} className="fill-amber-400 text-amber-400"/><Star size={12} className="fill-slate-200 text-slate-200"/></div>
                    <span className="text-xs font-bold">{p.rating}</span><span className="text-xs text-slate-400">({p.reviews})</span>
                  </div>
                  <div className="mt-2.5 flex items-end justify-between">
                    <div>
                      <div className="text-[#0F172A] font-black text-[15px] leading-none">{p.price.toLocaleString('fa-IR')} <span className="text-[10px] font-bold">تومان</span></div>
                      {p.oldPrice && <div className="text-xs text-slate-400 line-through">{p.oldPrice.toLocaleString('fa-IR')}</div>}
                    </div>
                    <button className="w-9 h-9 rounded-full bg-[#0F172A] text-white flex items-center justify-center group-hover:bg-[#FF4D00] transition"><ArrowLeft size={16}/></button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-5 flex items-center justify-between bg-[#0F172A] rounded-2xl px-4 lg:px-5 py-3.5 text-white">
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-full bg-[#FF4D00] flex items-center justify-center"><Clock3 size={16}/></span>
              <div>
                <div className="font-black text-sm">ارسال امروز اگر تا ۲ ساعت دیگر سفارش دهید</div>
                <div className="text-white/60 text-xs">تهران و کرج • تحویل درب منزل</div>
              </div>
            </div>
            <button onClick={()=>showToast('جزئیات ارسال')} className="hidden lg:flex h-9 px-5 rounded-full bg-white text-slate-900 font-bold text-sm">جزئیات</button>
          </div>
        </div>
      </section>

      {/* BESTSELLER + SPECIAL GRID */}
      <section className="max-w-[1280px] mx-auto px-4 lg:px-6 mt-6 grid lg:grid-cols-12 gap-6">
        {/* Bestsellers */}
        <div id="bestseller" className="lg:col-span-8 bg-white rounded-[24px] lg:rounded-[28px] p-4 lg:p-6">
          <div className="flex items-center justify-between">
            <h3 className="font-black text-[18px] lg:text-[20px] text-slate-900 flex items-center gap-3">
              <span className="w-1.5 h-7 rounded-full bg-[#0F172A]"/> پرفروش‌ترین‌ها
              <span className="hidden lg:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-200">این ماه <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"/></span>
            </h3>
            <div className="flex gap-1.5">
              <button onClick={()=>scroll(bestRef,'right')} className="w-8 h-8 rounded-full border border-slate-200 flex items-center justify-center hover:bg-slate-900 hover:text-white transition"><ChevronRight size={16}/></button>
              <button onClick={()=>scroll(bestRef,'left')} className="w-8 h-8 rounded-full border border-slate-200 flex items-center justify-center hover:bg-slate-900 hover:text-white transition"><ChevronLeft size={16}/></button>
            </div>
          </div>
          <div ref={bestRef} className="flex gap-3 overflow-x-auto scrollbar-none snap-x snap-mandatory mt-5 pb-2 -mx-1 px-1">
            {bestSellers.map(p=>(
              <div key={p.id} onClick={()=>setSelectedProduct(p)} className="snap-start shrink-0 w-[160px] lg:w-[186px] rounded-[20px] border border-slate-100 overflow-hidden hover:shadow-lg hover:border-slate-200 transition cursor-pointer bg-slate-50">
                <div className="relative h-[136px] bg-white overflow-hidden">
                  <img src={p.image} className="w-full h-full object-cover hover:scale-105 transition duration-500"/>
                  <span className="absolute top-2 right-2 px-2 py-1 rounded-full bg-slate-900 text-white text-[10px] font-black">{p.badge || 'پرفروش'}</span>
                </div>
                <div className="p-3">
                  <div className="text-xs font-bold text-slate-500">{p.brand}</div>
                  <div className="text-[13px] font-bold leading-5 text-slate-900 line-clamp-2 min-h-[40px]">{p.title}</div>
                  <div className="flex items-center gap-1 mt-1.5 text-xs"><Star size={12} className="fill-amber-400 text-amber-400"/> <span className="font-bold">{p.rating}</span> <span className="text-slate-400">({p.reviews})</span></div>
                  <div className="mt-2 flex items-baseline gap-1.5"><span className="font-black text-[14px] text-slate-900">{p.price.toLocaleString('fa-IR')}</span><span className="text-[10px]">تومان</span></div>
                  {p.oldPrice && <div className="text-xs text-slate-400 line-through">{p.oldPrice.toLocaleString('fa-IR')}</div>}
                </div>
              </div>
            ))}
          </div>
          <button onClick={()=>showToast('همه پرفروش‌ها')} className="w-full mt-4 h-11 rounded-full border-2 border-slate-900 text-slate-900 font-black text-sm hover:bg-slate-900 hover:text-white transition flex items-center justify-center gap-2">
            مشاهده همه پرفروش‌ها <ArrowLeft size={16}/>
          </button>
        </div>

        {/* Special Category - Ronix Black */}
        <div className="lg:col-span-4 bg-[#0F172A] rounded-[24px] lg:rounded-[28px] p-4 lg:p-6 text-white relative overflow-hidden">
          <div className="absolute -left-10 -top-10 w-40 h-40 rounded-full bg-[#FF4D00] blur-[60px] opacity-30"/>
          <div className="absolute -right-10 bottom-10 w-40 h-40 rounded-full bg-[#F59E0B] blur-[50px] opacity-20"/>
          <div className="relative">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#FF4D00] flex items-center justify-center font-black">R</div>
                <div>
                  <div className="font-black text-[15px] leading-none">سری مشکی رونیکس</div>
                  <div className="text-white/60 text-xs font-medium">RONIX PRO • ابزار دسته‌بندی خاص</div>
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-full bg-white text-slate-900 text-[11px] font-black">۴ کالا</span>
            </div>
            <p className="text-white/70 text-xs leading-6 mt-3">کلکسیون ابزار صنعتی مشکی مات با موتور براشلس و گارانتی ۲۴ ماهه — انتخاب حرفه‌ای‌ها</p>

            <div ref={specialRef} className="flex gap-3 overflow-x-auto scrollbar-none snap-x snap-mandatory mt-5 pb-2 -mx-1 px-1">
              {specialProducts.map(p=>(
                <div key={p.id} onClick={()=>setSelectedProduct(p)} className="snap-start shrink-0 w-[170px] bg-white rounded-[20px] p-2.5 text-slate-900 cursor-pointer hover:shadow-xl transition">
                  <div className="relative rounded-2xl overflow-hidden bg-slate-50 h-[120px]">
                    <img src={p.image} className="w-full h-full object-cover"/>
                    <span className="absolute top-2 right-2 px-2 py-1 rounded-full bg-[#0F172A] text-white text-[10px] font-bold">{p.badge || 'PRO'}</span>
                  </div>
                  <div className="mt-2.5 px-1">
                    <div className="text-[12.5px] font-bold leading-5 line-clamp-2 min-h-[40px]">{p.title}</div>
                    <div className="flex items-center gap-1 mt-1"><Star size={11} className="fill-amber-400 text-amber-400"/><span className="text-xs font-bold">{p.rating}</span></div>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="font-black text-sm">{(p.price/1000000).toFixed(1)}<span className="text-[10px] mr-1">م تومن</span></span>
                      <span className="w-7 h-7 rounded-full bg-[#FF4D00] text-white flex items-center justify-center"><ArrowLeft size={14}/></span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-2 mt-4">
              <button onClick={()=>scroll(specialRef,'right')} className="flex-1 h-10 rounded-full bg-white/10 border border-white/15 flex items-center justify-center hover:bg-white hover:text-slate-900 transition"><ChevronRight size={18}/></button>
              <button onClick={()=>scroll(specialRef,'left')} className="flex-1 h-10 rounded-full bg-white/10 border border-white/15 flex items-center justify-center hover:bg-white hover:text-slate-900 transition"><ChevronLeft size={18}/></button>
              <button onClick={()=>showToast('کلکسیون رونیکس')} className="flex-[2] h-10 rounded-full bg-[#FF4D00] font-black text-sm hover:bg-[#e64500] transition">نمایش کلکسیون</button>
            </div>
          </div>
        </div>
      </section>

      {/* BLOG */}
      <section id="blog" className="max-w-[1280px] mx-auto px-4 lg:px-6 mt-8">
        <div className="flex items-end justify-between">
          <div>
            <div className="inline-flex items-center gap-2 text-[11px] font-black tracking-widest text-white/70">MAGAZINE <span className="w-8 h-px bg-white/30"/></div>
            <h2 className="text-[22px] lg:text-[28px] font-black text-white leading-none mt-2">مجله آموزشی ایران یراق</h2>
            <p className="text-white/60 text-[13px] mt-2">هر هفته، ترفندهای کارگاهی که پول شما را ذخیره می‌کند</p>
          </div>
          <button onClick={()=>showToast('ورود به مجله')} className="hidden lg:flex h-10 px-5 rounded-full bg-white text-slate-900 font-bold text-sm">همه مقالات <ArrowLeft size={16} className="mr-2"/></button>
        </div>

        <div className="grid md:grid-cols-3 gap-4 lg:gap-5 mt-6">
          {blogPosts.map(post=>(
            <article key={post.id} onClick={()=>showToast(`مقاله: ${post.title}`)} className="group bg-white rounded-[22px] overflow-hidden hover:shadow-xl hover:-translate-y-1 transition-all duration-300 cursor-pointer">
              <div className="relative h-[184px] overflow-hidden">
                <img src={post.image} className="w-full h-full object-cover group-hover:scale-105 transition duration-700"/>
                <span className="absolute top-3 right-3 px-3 py-1 rounded-full bg-[#0F172A] text-white text-xs font-bold">{post.tag}</span>
                <span className="absolute bottom-3 left-3 px-2.5 py-1 rounded-full bg-white/90 backdrop-blur text-slate-900 text-xs font-bold flex items-center gap-1"><Clock3 size={12}/> {post.read}</span>
              </div>
              <div className="p-4 lg:p-5">
                <div className="text-xs text-slate-400 font-medium">{post.date} • {post.read} مطالعه</div>
                <h4 className="font-black text-[15px] leading-6 text-slate-900 mt-1.5 line-clamp-2 group-hover:text-[#FF4D00] transition">{post.title}</h4>
                <p className="text-[13px] leading-6 text-slate-500 mt-2 line-clamp-2">{post.excerpt}</p>
                <div className="mt-4 inline-flex items-center gap-1.5 text-sm font-black text-[#0F172A] group-hover:gap-2.5 transition-all">ادامه مطلب <ArrowLeft size={16} className="bg-slate-900 text-white rounded-full p-0.5"/></div>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* SERVICES */}
      <section id="services" className="max-w-[1280px] mx-auto px-4 lg:px-6 mt-8">
        <div className="bg-white rounded-[24px] lg:rounded-[28px] p-4 lg:p-8">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <h3 className="font-black text-[20px] lg:text-[22px] text-slate-900">چرا ۴۸ هزار استادکار، ایران یراق را انتخاب کرده‌اند؟</h3>
              <p className="text-slate-500 text-[13px] mt-1">خدماتی که کار شما را آسان‌تر می‌کند، نه سخت‌تر</p>
            </div>
            <div className="hidden lg:flex items-center gap-2 text-xs font-bold text-slate-500">
              <span className="w-2 h-2 rounded-full bg-emerald-500"/> پشتیبانی تا ۱۰ شب • حتی جمعه‌ها
            </div>
          </div>

          <div className="grid md:grid-cols-4 gap-4 mt-6">
            {services.map(s=>{
              const Icon = s.icon
              return (
                <div key={s.title} className="rounded-[20px] bg-slate-50 border border-slate-100 p-5 hover:bg-white hover:shadow-lg hover:border-slate-200 transition group">
                  <div className={`w-12 h-12 rounded-2xl ${s.color} text-white flex items-center justify-center shadow-md group-hover:scale-105 transition`}>
                    <Icon size={22}/>
                  </div>
                  <div className="font-black text-slate-900 mt-4 leading-none">{s.title}</div>
                  <div className="text-[13px] leading-6 text-slate-500 mt-2">{s.desc}</div>
                  <div className="mt-3 inline-flex items-center gap-1 text-xs font-black text-slate-900">بیشتر بدانید <ArrowLeft size={14}/></div>
                </div>
              )
            })}
          </div>

          {/* Stats bar */}
          <div className="mt-6 grid grid-cols-3 lg:grid-cols-4 gap-3 bg-[#0F172A] rounded-[20px] p-4 lg:p-5 text-white text-center">
            {[
              {n:"۴۸,۲۳۰", l:"مشتری راضی"},
              {n:"۴.۸ / ۵", l:"امتیاز فروشگاه"},
              {n:"۹۸.۲٪", l:"تحویل به‌موقع"},
              {n:"۲۴ ماه", l:"گارانتی واقعی"},
            ].map(s=>(
              <div key={s.l} className="py-1">
                <div className="font-black text-[18px] lg:text-[22px] leading-none">{s.n}</div>
                <div className="text-white/60 text-xs mt-1">{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Newsletter + Brands */}
      <section className="max-w-[1280px] mx-auto px-4 lg:px-6 mt-6">
        <div className="rounded-[24px] lg:rounded-[28px] bg-gradient-to-l from-[#FF4D00] to-[#ff7a00] p-5 lg:p-7 text-white relative overflow-hidden">
          <div className="absolute -left-10 -top-10 w-40 h-40 rounded-full bg-white/15 blur-2xl"/>
          <div className="absolute -right-10 bottom-0 w-60 h-60 rounded-full bg-black/10 blur-3xl"/>
          <div className="relative flex flex-col lg:flex-row items-center justify-between gap-6">
            <div className="flex-1">
              <h4 className="font-black text-[18px] lg:text-[20px]">عضو باشگاه استادکاران شوید</h4>
              <p className="text-white/85 text-[13px] mt-1.5 leading-6">کد تخفیف ۱۵۰ هزار تومانی + اطلاع از حراج‌های پنهان قبل از همه</p>
            </div>
            <form onSubmit={e=>{e.preventDefault(); showToast('کد تخفیف ارسال شد ✓')}} className="flex w-full lg:w-auto gap-2 bg-white rounded-full p-1.5 lg:min-w-[420px]">
              <input placeholder="شماره موبایل یا ایمیل" className="flex-1 bg-transparent px-5 text-slate-900 placeholder:text-slate-400 text-sm focus:outline-none"/>
              <button className="h-10 px-6 rounded-full bg-[#0F172A] text-white font-black text-sm hover:bg-black transition shrink-0">دریافت کد</button>
            </form>
          </div>
        </div>

        <div className="flex items-center gap-3 lg:gap-6 mt-6 overflow-x-auto scrollbar-none py-2">
          {['BOSCH','Ronix','Tosan','DEWALT','Makita','NEC','HANS'].map(b=>(
            <div key={b} className="shrink-0 h-14 px-7 rounded-2xl bg-white border border-slate-100 flex items-center justify-center font-black tracking-widest text-slate-400 text-sm">{b}</div>
          ))}
          <span className="shrink-0 text-white/50 text-xs font-bold mr-2">+۳۲ برند دیگر</span>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="mt-8 bg-white border-t border-slate-100">
        <div className="max-w-[1280px] mx-auto px-4 lg:px-6">
          <div className="py-8 lg:py-10 grid lg:grid-cols-12 gap-8">
            <div className="lg:col-span-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#FF4D00] text-white flex items-center justify-center font-black text-xl">آ</div>
                <div>
                  <div className="font-black text-[17px] leading-none text-slate-900">ایران یراق</div>
                  <div className="text-xs text-slate-500">فروشگاه تخصصی ابزارآلات • ۱۳۸۵ تا امروز</div>
                </div>
              </div>
              <p className="text-[13px] leading-7 text-slate-500 mt-4">
                ایران یراق مرجع تخصصی خرید ابزار برقی، دستی و بادی با تضمین کمترین قیمت بازار، مشاوره فنی رایگان و ارسال فوری. از کارگاه کوچک تا پروژه صنعتی، کنار شما هستیم.
              </p>
              <div className="flex gap-2 mt-5">
                <a href="#" className="w-9 h-9 rounded-full bg-slate-900 text-white flex items-center justify-center hover:bg-[#FF4D00] transition"><Instagram size={16}/></a>
                <a href="#" className="w-9 h-9 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center hover:bg-slate-900 hover:text-white transition"><Send size={16}/></a>
                <a href="#" className="w-9 h-9 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center hover:bg-slate-900 hover:text-white transition"><Mail size={16}/></a>
              </div>
            </div>

            <div className="lg:col-span-2">
              <div className="font-black text-slate-900 text-sm">دسترسی سریع</div>
              <ul className="mt-4 space-y-2.5 text-[13px] text-slate-500">
                <li><a href="#" className="hover:text-[#FF4D00]">دسته‌بندی ابزار</a></li>
                <li><a href="#" className="hover:text-[#FF4D00]">پرفروش‌ترین‌ها</a></li>
                <li><a href="#" className="hover:text-[#FF4D00]">پیشنهاد ویژه</a></li>
                <li><a href="#" className="hover:text-[#FF4D00]">مجله آموزشی</a></li>
                <li><a href="#" className="hover:text-[#FF4D00]">تماس با ما</a></li>
              </ul>
            </div>
            <div className="lg:col-span-2">
              <div className="font-black text-slate-900 text-sm">راهنمای خرید</div>
              <ul className="mt-4 space-y-2.5 text-[13px] text-slate-500">
                <li><a href="#" className="hover:text-[#FF4D00]">نحوه ثبت سفارش</a></li>
                <li><a href="#" className="hover:text-[#FF4D00]">شیوه‌های پرداخت</a></li>
                <li><a href="#" className="hover:text-[#FF4D00]">ارسال و تحویل</a></li>
                <li><a href="#" className="hover:text-[#FF4D00]">گارانتی و بازگشت</a></li>
                <li><a href="#" className="hover:text-[#FF4D00]">خرید اقساطی</a></li>
              </ul>
            </div>
            <div className="lg:col-span-4">
              <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4">
                <div className="font-black text-slate-900 text-sm flex items-center gap-2"><MapPin size={16} className="text-[#FF4D00]"/> آدرس فروشگاه مرکزی</div>
                <div className="text-[13px] leading-6 text-slate-500 mt-2">تهران، خیابان امام خمینی، نرسیده به حسن‌آباد، مرکز فروش ایران یراق، طبقه همکف، پلاک ۴۲</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="px-3 py-1.5 rounded-full bg-white border border-slate-200 text-xs font-bold flex items-center gap-1"><Phone size={12}/> ۰۲۱-۶۶۷۰۰۰۰۰</span>
                  <span className="px-3 py-1.5 rounded-full bg-white border border-slate-200 text-xs font-bold flex items-center gap-1"><Mail size={12}/> info@aradtools.ir</span>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-4">
                  {[1,2,3].map(i=>(
                    <div key={i} className="h-16 rounded-xl bg-white border border-slate-200 flex flex-col items-center justify-center text-[10px] font-bold text-slate-400">
                      <BadgeCheck size={20} className="text-slate-300"/><span className="mt-1">{i===1?'نماد اعتماد':i===2?'ساماندهی':'انجمن کسب‌وکار'}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-slate-100 py-5 flex flex-col lg:flex-row items-center justify-between gap-3 text-xs text-slate-400">
            <span>© ۱۴۰۳ ایران یراق — کلیه حقوق محفوظ است. طراحی شده برای استادکاران ایرانی.</span>
            <span className="flex items-center gap-3">
              <a href="#" className="hover:text-slate-900">حریم خصوصی</a>
              <span className="w-1 h-1 rounded-full bg-slate-300"/>
              <a href="#" className="hover:text-slate-900">قوانین</a>
              <span className="w-1 h-1 rounded-full bg-slate-300"/>
              <span>ساخته شده با ♥ در تهران</span>
            </span>
          </div>
        </div>
      </footer>

      {/* Floating Detached Bottom Menu - Style 03 */}
      <div className="lg:hidden fixed bottom-0 inset-x-0 z-50 pointer-events-none">
        {/* safe area background */}
        <div className="mx-auto max-w-[480px] px-4 pb-4 pt-2">
          <div className="pointer-events-auto bg-white rounded-[28px] shadow-[0_12px_40px_rgba(0,0,0,0.16),0_4px_12px_rgba(0,0,0,0.08)] border border-slate-100 flex items-center justify-between px-2 py-2">
            <button
              onClick={()=>{setMobileNav('home'); document.getElementById('home')?.scrollIntoView({behavior:'smooth'})}}
              className={`flex flex-col items-center gap-1 min-w-[64px] py-1.5 rounded-2xl transition ${mobileNav==='home' ? 'text-[#6842ff]' : 'text-slate-400'}`}
            >
              <Home size={22} className={mobileNav==='home' ? 'fill-[#6842ff]/15' : ''} strokeWidth={mobileNav==='home'?2.3:1.9}/>
              <span className={`text-[11px] font-bold leading-none ${mobileNav==='home' ? 'text-[#6842ff]' : 'text-slate-500'}`}>خانه</span>
              {mobileNav==='home' && <span className="w-1 h-1 rounded-full bg-[#6842ff] mt-0.5"/>}
            </button>

            <button onClick={()=>{setMobileNav('search'); setShowSearch(true); window.scrollTo({top:0, behavior:'smooth'})}} className={`flex flex-col items-center gap-1 min-w-[64px] py-1.5 transition ${mobileNav==='search'?'text-[#6842ff]':'text-slate-400'}`}>
              <Search size={22} strokeWidth={mobileNav==='search'?2.3:1.9}/>
              <span className={`text-[11px] font-medium leading-none ${mobileNav==='search'?'text-[#6842ff] font-bold':'text-slate-500'}`}>جستجو</span>
            </button>

            <button
              onClick={()=>{setMobileNav('create'); document.getElementById('categories')?.scrollIntoView({behavior:'smooth'}); showToast('دسته‌بندی‌ها')}}
              className="flex flex-col items-center gap-1 min-w-[64px] -mt-2"
            >
              <span className="w-[52px] h-[52px] rounded-full bg-[#6842ff] text-white flex items-center justify-center shadow-lg shadow-[#6842ff]/30 border-[3.5px] border-white">
                <LayoutGrid size={22} strokeWidth={2.2}/>
              </span>
              <span className={`text-[11px] font-bold leading-none ${mobileNav==='create'?'text-[#6842ff]':'text-slate-500'}`}>دسته‌ها</span>
            </button>

            <button onClick={()=>{setMobileNav('inbox'); showToast('پشتیبانی: ۰۲۱-۸۸۸۸۸۸۸۸')}} className={`flex flex-col items-center gap-1 min-w-[64px] py-1.5 transition ${mobileNav==='inbox'?'text-[#6842ff]':'text-slate-400'}`}>
              <MessageCircle size={22} strokeWidth={mobileNav==='inbox'?2.3:1.9}/>
              <span className={`text-[11px] font-medium leading-none ${mobileNav==='inbox'?'text-[#6842ff] font-bold':'text-slate-500'}`}>پشتیبانی</span>
            </button>

            <button onClick={()=>{setMobileNav('profile'); showToast('حساب کاربری')}} className={`flex flex-col items-center gap-1 min-w-[64px] py-1.5 transition ${mobileNav==='profile'?'text-[#6842ff]':'text-slate-400'}`}>
              <User size={22} strokeWidth={mobileNav==='profile'?2.3:1.9}/>
              <span className={`text-[11px] font-medium leading-none ${mobileNav==='profile'?'text-[#6842ff] font-bold':'text-slate-500'}`}>پروفایل</span>
            </button>
          </div>
          <div className="flex justify-center mt-2">
            <div className="w-32 h-1 rounded-full bg-white/80 shadow-sm"/>
          </div>
        </div>
      </div>

      {/* Bottom padding for floating menu */}
      <div className="h-24 lg:h-0"/>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div initial={{opacity:0, y:20, scale:0.95}} animate={{opacity:1, y:0, scale:1}} exit={{opacity:0, y:20, scale:0.95}} className="fixed bottom-24 lg:bottom-6 left-1/2 -translate-x-1/2 z-[60] bg-slate-900 text-white px-5 py-3 rounded-full shadow-2xl text-sm font-bold flex items-center gap-2 border border-white/10">
            <span className="w-7 h-7 rounded-full bg-[#FF4D00] flex items-center justify-center">✓</span> {toast}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Product Modal */}
      <AnimatePresence>
        {selectedProduct && (
          <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm flex items-end lg:items-center justify-center p-0 lg:p-4" onClick={()=>setSelectedProduct(null)}>
            <motion.div initial={{y:40, opacity:0}} animate={{y:0, opacity:1}} exit={{y:40, opacity:0}} onClick={e=>e.stopPropagation()} className="w-full max-w-[720px] bg-white rounded-t-[28px] lg:rounded-[28px] overflow-hidden max-h-[92vh] overflow-y-auto">
              <div className="relative h-[280px] lg:h-[360px] bg-slate-50">
                <img src={selectedProduct.image} className="w-full h-full object-cover"/>
                <button onClick={()=>setSelectedProduct(null)} className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white shadow flex items-center justify-center"><X size={18}/></button>
                {selectedProduct.badge && <span className="absolute top-4 left-4 px-3 py-1.5 rounded-full bg-[#FF4D00] text-white text-xs font-black">{selectedProduct.badge}</span>}
              </div>
              <div className="p-6">
                <div className="text-xs font-black tracking-widest text-slate-400">{selectedProduct.brand} • {selectedProduct.cat}</div>
                <h3 className="font-black text-[18px] leading-7 text-slate-900 mt-1">{selectedProduct.title}</h3>
                <div className="flex items-center gap-2 mt-2">
                  <div className="flex"><Star size={14} className="fill-amber-400 text-amber-400"/><Star size={14} className="fill-amber-400 text-amber-400"/><Star size={14} className="fill-amber-400 text-amber-400"/><Star size={14} className="fill-amber-400 text-amber-400"/><Star size={14} className="fill-slate-200 text-slate-200"/></div>
                  <span className="text-sm font-bold">{selectedProduct.rating}</span><span className="text-sm text-slate-400">({selectedProduct.reviews} نظر)</span><span className="px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold">موجود در انبار</span>
                </div>
                <div className="mt-5 flex items-baseline gap-3">
                  <span className="font-black text-[22px] text-slate-900">{selectedProduct.price.toLocaleString('fa-IR')} تومان</span>
                  {selectedProduct.oldPrice && <span className="text-sm text-slate-400 line-through">{selectedProduct.oldPrice.toLocaleString('fa-IR')}</span>}
                  {selectedProduct.oldPrice && <span className="px-2 py-1 rounded-full bg-red-500 text-white text-xs font-black">٪{Math.round((1-selectedProduct.price/selectedProduct.oldPrice)*100)} تخفیف</span>}
                </div>
                <p className="text-[13px] leading-7 text-slate-500 mt-4">این ابزار با موتور قدرتمند، بدنه ارگونومیک ضد لرزش و گیربکس صنعتی برای استفاده طولانی‌مدت در کارگاه و پروژه‌های ساختمانی طراحی شده است. همراه با کیف BMC، دفترچه و کارت گارانتی.</p>
                <div className="grid grid-cols-3 gap-2 mt-5">
                  {[
                    {k:"قدرت", v:"750 وات"},
                    {k:"وزن", v:"1.8 کیلوگرم"},
                    {k:"گارانتی", v:"18 ماه"},
                  ].map(f=>(
                    <div key={f.k} className="rounded-2xl bg-slate-50 border border-slate-100 p-3 text-center">
                      <div className="text-xs text-slate-400 font-bold">{f.k}</div><div className="font-black text-slate-900 text-sm mt-1">{f.v}</div>
                    </div>
                  ))}
                </div>
                <div className="flex gap-3 mt-6">
                  <button onClick={()=>{showToast('به سبد افزوده شد'); setSelectedProduct(null)}} className="flex-1 h-12 rounded-full bg-[#FF4D00] text-white font-black hover:bg-[#e64500] transition">افزودن به سبد خرید</button>
                  <button onClick={()=>showToast('مشاوره: ۰۲۱-۸۸۸۸۸۸۸۸')} className="h-12 px-6 rounded-full border-2 border-slate-900 font-black">مشاوره</button>
                </div>
                <div className="flex items-center justify-center gap-4 mt-4 text-xs text-slate-400">
                  <span className="flex items-center gap-1"><Truck size={14}/> ارسال رایگان</span>
                  <span className="flex items-center gap-1"><ShieldCheck size={14}/> ضمانت بازگشت ۷ روزه</span>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        .scrollbar-none::-webkit-scrollbar{display:none}
        .scrollbar-none{scrollbar-width:none;-ms-overflow-style:none}
      `}</style>
    </div>
  )
}
