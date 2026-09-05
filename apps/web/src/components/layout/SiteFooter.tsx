import { BadgeCheck, Instagram, Mail, MapPin, Phone, Send } from 'lucide-react'
import { useToast } from '../feedback/toast-context'

export function SiteFooter() {
  const { show } = useToast()

  return (
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
              <button type="button" onClick={() => show('اینستاگرام بهزودی فعال میشود')} aria-label="اینستاگرام ایران یراق" className="w-9 h-9 rounded-full bg-slate-900 text-white flex items-center justify-center hover:bg-[#FF4D00] transition"><Instagram size={16} /></button>
              <button type="button" onClick={() => show('پیامرسان بهزودی فعال میشود')} aria-label="پیامرسان ایران یراق" className="w-9 h-9 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center hover:bg-slate-900 hover:text-white transition"><Send size={16} /></button>
              <button type="button" onClick={() => show('پست الکترونیک: info@aradtools.ir')} aria-label="ایمیل ایران یراق" className="w-9 h-9 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center hover:bg-slate-900 hover:text-white transition"><Mail size={16} /></button>
            </div>
          </div>

          <div className="lg:col-span-2">
            <div className="font-black text-slate-900 text-sm">دسترسی سریع</div>
            <ul className="mt-4 space-y-2.5 text-[13px] text-slate-500">
              <li><a href="#categories" className="hover:text-[#FF4D00]">دسته‌بندی ابزار</a></li>
              <li><a href="#bestseller" className="hover:text-[#FF4D00]">پرفروش‌ترین‌ها</a></li>
              <li><a href="#popular" className="hover:text-[#FF4D00]">پیشنهاد ویژه</a></li>
              <li><a href="#blog" className="hover:text-[#FF4D00]">مجله آموزشی</a></li>
              <li><button type="button" onClick={() => show('تماس: ۰۲۱-۶۶۷۰۰۰۰۰')} className="hover:text-[#FF4D00] transition">تماس با ما</button></li>
            </ul>
          </div>
          <div className="lg:col-span-2">
            <div className="font-black text-slate-900 text-sm">راهنمای خرید</div>
            <ul className="mt-4 space-y-2.5 text-[13px] text-slate-500">
              <li><button type="button" onClick={() => show('این بخش بهزودی فعال میشود')} className="hover:text-[#FF4D00] transition">نحوه ثبت سفارش</button></li>
              <li><button type="button" onClick={() => show('این بخش بهزودی فعال میشود')} className="hover:text-[#FF4D00] transition">شیوه‌های پرداخت</button></li>
              <li><button type="button" onClick={() => show('این بخش بهزودی فعال میشود')} className="hover:text-[#FF4D00] transition">ارسال و تحویل</button></li>
              <li><button type="button" onClick={() => show('این بخش بهزودی فعال میشود')} className="hover:text-[#FF4D00] transition">گارانتی و بازگشت</button></li>
              <li><button type="button" onClick={() => show('این بخش بهزودی فعال میشود')} className="hover:text-[#FF4D00] transition">خرید اقساطی</button></li>
            </ul>
          </div>
          <div className="lg:col-span-4">
            <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4">
              <div className="font-black text-slate-900 text-sm flex items-center gap-2"><MapPin size={16} className="text-[#FF4D00]" /> آدرس فروشگاه مرکزی</div>
              <div className="text-[13px] leading-6 text-slate-500 mt-2">تهران، خیابان امام خمینی، نرسیده به حسن‌آباد، مرکز فروش ایران یراق، طبقه همکف، پلاک ۴۲</div>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="px-3 py-1.5 rounded-full bg-white border border-slate-200 text-xs font-bold flex items-center gap-1"><Phone size={12} /> ۰۲۱-۶۶۷۰۰۰۰۰</span>
                <span className="px-3 py-1.5 rounded-full bg-white border border-slate-200 text-xs font-bold flex items-center gap-1"><Mail size={12} /> info@aradtools.ir</span>
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
          <span>© ۱۴۰۳ ایران یراق — کلیه حقوق محفوظ است. طراحی شده برای استادکاران ایرانی.</span>
          <span className="flex items-center gap-3">
            <button type="button" onClick={() => show('این بخش بهزودی فعال میشود')} className="hover:text-slate-900 transition">حریم خصوصی</button>
            <span className="w-1 h-1 rounded-full bg-slate-300" />
            <button type="button" onClick={() => show('این بخش بهزودی فعال میشود')} className="hover:text-slate-900 transition">قوانین</button>
            <span className="w-1 h-1 rounded-full bg-slate-300" />
            <span>ساخته شده با ♥ در تهران</span>
          </span>
        </div>
      </div>
    </footer>
  )
}