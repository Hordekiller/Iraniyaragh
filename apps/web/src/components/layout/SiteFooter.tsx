import { Link } from 'react-router-dom'
import { BadgeCheck, PackageSearch, ShoppingBag, UserRound } from 'lucide-react'
import { SITE_ADDRESS_LINE, SITE_NAME, SITE_PHONE, SITE_POSTAL_CODE } from '../../lib/site-config'
import { gregorianToJalali, toPersianDigits } from '../../lib/format'
import { ROUTES } from '../../lib/routes'

function currentJalaliYear(): number {
  const now = new Date()
  return gregorianToJalali(now.getFullYear(), now.getMonth() + 1, now.getDate()).year
}

export function SiteFooter() {
  const currentYear = toPersianDigits(currentJalaliYear())

  return (
    <footer className="mt-8 bg-white border-t border-slate-100">
      <div className="max-w-[1280px] mx-auto px-4 lg:px-6">
        <div className="py-8 lg:py-10 grid lg:grid-cols-12 gap-8">
          <div className="lg:col-span-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#FF4D00] text-white flex items-center justify-center font-black text-xl">آ</div>
              <div>
                <div className="font-black text-[17px] leading-none text-slate-900">{SITE_NAME}</div>
                <div className="text-xs text-slate-500">فروشگاه تخصصی ابزار و یراق‌آلات</div>
              </div>
            </div>
            <p className="text-[13px] leading-7 text-slate-500 mt-4">
              مرور کاتالوگ آنلاین ابزار برقی، دستی و بادی؛ ورود با شماره موبایل و پیگیری آنلاین سفارش‌ها از حساب کاربری. قیمت و موجودی کالاها به‌صورت زنده از فروشگاه نمایش داده می‌شود و جمع سفارش در مرحلهٔ پرداخت از سمت فروشگاه تایید می‌شود.
            </p>
            <address className="not-italic text-[12.5px] leading-7 text-slate-500 mt-4">
              <div>{SITE_ADDRESS_LINE}</div>
              <div>
                کد پستی {toPersianDigits(SITE_POSTAL_CODE)} —{' '}
                <a href={`tel:${SITE_PHONE}`} className="hover:text-[#FF4D00] transition" dir="ltr">
                  {toPersianDigits(SITE_PHONE)}
                </a>
              </div>
            </address>
          </div>

          <div className="lg:col-span-3">
            <div className="font-black text-slate-900 text-sm">دسترسی سریع</div>
            <ul className="mt-4 space-y-3 text-[13px] text-slate-500">
              <li><Link to={ROUTES.categories} className="hover:text-[#FF4D00] transition">دسته‌بندی ابزار</Link></li>
              <li><Link to={ROUTES.products} className="hover:text-[#FF4D00] transition">همه کالاها</Link></li>
              <li><Link to={ROUTES.newest} className="hover:text-[#FF4D00] transition">تازه‌های فروشگاه</Link></li>
              <li><Link to={ROUTES.services} className="hover:text-[#FF4D00] transition">خدمات فروشگاه</Link></li>
            </ul>
          </div>
          <div className="lg:col-span-4">
            <div className="font-black text-slate-900 text-sm">حساب و سفارش</div>
            <ul className="mt-4 space-y-3 text-[13px] text-slate-500">
              <li><Link to={ROUTES.orders} className="inline-flex items-center gap-2 hover:text-[#FF4D00] transition"><PackageSearch size={15} /> پیگیری سفارش</Link></li>
              <li><Link to={ROUTES.cart} className="inline-flex items-center gap-2 hover:text-[#FF4D00] transition"><ShoppingBag size={15} /> سبد خرید</Link></li>
              <li><Link to={ROUTES.account} className="inline-flex items-center gap-2 hover:text-[#FF4D00] transition"><UserRound size={15} /> حساب کاربری</Link></li>
            </ul>
            <div className="mt-5 rounded-2xl bg-slate-50 border border-slate-100 p-4 flex items-start gap-3">
              <BadgeCheck size={18} className="text-[#FF4D00] shrink-0 mt-0.5" />
              <p className="text-[12.5px] leading-6 text-slate-600">
                هزینهٔ ارسال و جمع نهایی سفارش هنگام پرداخت اعلام و از سمت سرور تایید می‌شود.
              </p>
            </div>
          </div>
        </div>

        <div className="border-t border-slate-100 py-5 flex flex-col lg:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <span>© {currentYear} {SITE_NAME} — کلیه حقوق محفوظ است.</span>
          <nav aria-label="قوانین فروشگاه" className="flex items-center gap-4">
            <Link to={ROUTES.terms} className="hover:text-[#FF4D00] transition">قوانین و شرایط فروش</Link>
            <Link to={ROUTES.privacy} className="hover:text-[#FF4D00] transition">حریم خصوصی</Link>
          </nav>
        </div>
      </div>
    </footer>
  )
}