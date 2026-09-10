import { BadgeCheck, Instagram, Mail, MapPin, Phone } from 'lucide-react'
import {
  ADDRESS_FULL,
  EMAIL,
  FREE_SHIPPING_THRESHOLD_TOMAN,
  INSTAGRAM_URL,
  PHONE_SECONDARY,
  SECTION_IDS,
  SHIPPING_COST_TOMAN,
  SITE_FOUNDING_YEAR,
  SITE_NAME,
  SUPPORT_HOURS,
  WORKING_HOURS,
} from '../../lib/site-config'
import { gregorianToJalali, toLatinDigits, toPersianDigits } from '../../lib/format'

function currentJalaliYear(): number {
  const now = new Date()
  return gregorianToJalali(now.getFullYear(), now.getMonth() + 1, now.getDate()).year
}

function telHref(phone: string): string {
  return `tel:${toLatinDigits(phone).replace(/[^0-9]/g, '')}`
}

export function SiteFooter() {
  const foundingYear = toPersianDigits(SITE_FOUNDING_YEAR)
  const currentYear = toPersianDigits(currentJalaliYear())

  return (
    <footer className="mt-8 bg-white border-t border-slate-100">
      <div className="max-w-[1280px] mx-auto px-4 lg:px-6">
        <div className="py-8 lg:py-10 grid lg:grid-cols-12 gap-8">
          <div className="lg:col-span-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#FF4D00] text-white flex items-center justify-center font-black text-xl">آ</div>
              <div>
                <div className="font-black text-[17px] leading-none text-slate-900">{SITE_NAME}</div>
                <div className="text-xs text-slate-500">فروشگاه تخصصی ابزارآلات • {foundingYear} تا امروز</div>
              </div>
            </div>
            <p className="text-[13px] leading-7 text-slate-500 mt-4">
              ایران یراق مرجع تخصصی خرید ابزار برقی، دستی و بادی با تضمین کمترین قیمت بازار، مشاوره فنی رایگان و ارسال فوری. از کارگاه کوچک تا پروژه صنعتی، کنار شما هستیم.
            </p>
            <div className="flex gap-2 mt-5">
              <a href={`mailto:${EMAIL}`} aria-label="ایمیل ایران یراق" className="w-9 h-9 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center hover:bg-slate-900 hover:text-white transition"><Mail size={16} /></a>
              <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer" aria-label="اینستاگرام ایران یراق" className="w-9 h-9 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center hover:bg-slate-900 hover:text-white transition"><Instagram size={16} /></a>
            </div>
          </div>

          <div className="lg:col-span-2">
            <div className="font-black text-slate-900 text-sm">دسترسی سریع</div>
            <ul className="mt-4 space-y-2.5 text-[13px] text-slate-500">
              <li><a href={`#${SECTION_IDS.categories}`} className="hover:text-[#FF4D00]">دسته‌بندی ابزار</a></li>
              <li><a href={`#${SECTION_IDS.bestseller}`} className="hover:text-[#FF4D00]">پرفروش‌ترین‌ها</a></li>
              <li><a href={`#${SECTION_IDS.popular}`} className="hover:text-[#FF4D00]">پیشنهاد ویژه</a></li>
              <li><a href={`#${SECTION_IDS.blog}`} className="hover:text-[#FF4D00]">مجله آموزشی</a></li>
              <li><a href={telHref(PHONE_SECONDARY)} className="hover:text-[#FF4D00] transition">تماس با ما</a></li>
            </ul>
          </div>
          <div className="lg:col-span-2">
            <div className="font-black text-slate-900 text-sm">راهنمای خرید</div>
<ul className="mt-4 space-y-2.5 text-[13px] text-slate-500">
              <li>ارسال رایگان برای خرید بالای {toPersianDigits(FREE_SHIPPING_THRESHOLD_TOMAN)} تومان</li>
              <li>هزینه ارسال عادی {toPersianDigits(SHIPPING_COST_TOMAN)} تومان</li>
              <li>ساعات کاری: {WORKING_HOURS}</li>
              <li>پشتیبانی: {SUPPORT_HOURS}</li>
            </ul>
          </div>
          <div className="lg:col-span-4">
            <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4">
              <div className="font-black text-slate-900 text-sm flex items-center gap-2"><MapPin size={16} className="text-[#FF4D00]" /> آدرس فروشگاه مرکزی</div>
              <div className="text-[13px] leading-6 text-slate-500 mt-2">{ADDRESS_FULL}</div>
              <div className="mt-3 flex flex-wrap gap-2">
                <a href={telHref(PHONE_SECONDARY)} className="px-3 py-1.5 rounded-full bg-white border border-slate-200 text-xs font-bold flex items-center gap-1 hover:border-[#FF4D00]/40"><Phone size={12} /> {PHONE_SECONDARY}</a>
                <a href={`mailto:${EMAIL}`} className="px-3 py-1.5 rounded-full bg-white border border-slate-200 text-xs font-bold flex items-center gap-1 hover:border-[#FF4D00]/40"><Mail size={12} /> {EMAIL}</a>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-4">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-16 rounded-xl bg-white border border-slate-200 flex flex-col items-center justify-center text-[10px] font-bold text-slate-500">
                    <BadgeCheck size={20} className="text-slate-300" /><span className="mt-1">{i === 1 ? 'نماد اعتماد' : i === 2 ? 'ساماندهی' : 'انجمن کسب‌وکار'}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-slate-100 py-5 flex flex-col lg:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <span>© {currentYear} {SITE_NAME} — کلیه حقوق محفوظ است. طراحی شده برای استادکاران ایرانی.</span>
          <span>ساخته شده با ♥ در تهران</span>
        </div>
      </div>
    </footer>
  )
}