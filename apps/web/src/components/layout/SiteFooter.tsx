import { Link } from 'react-router-dom'
import { MapPin, Phone, ShoppingBag, UserRound } from 'lucide-react'
import {
  HAS_SITE_PHONE,
  SITE_ADDRESS_LINE,
  SITE_NAME,
  SITE_PHONE,
  SITE_PHONE_PERSIAN,
  SITE_POSTAL_CODE,
  SITE_TAGLINE,
} from '../../lib/site-config'
import { gregorianToJalali, toPersianDigits } from '../../lib/format'
import { ROUTES } from '../../lib/routes'

function currentJalaliYear(): number {
  const now = new Date()
  return gregorianToJalali(now.getFullYear(), now.getMonth() + 1, now.getDate()).year
}

const hasContactBlock = HAS_SITE_PHONE || SITE_ADDRESS_LINE !== null || SITE_POSTAL_CODE !== null

export function SiteFooter() {
  return (
    <footer className="mt-8 bg-white border-t border-slate-100">
      <div className="max-w-[1280px] mx-auto px-4 lg:px-6">
        <div className="py-8 lg:py-10 grid gap-8 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <div className="font-black text-[17px] text-slate-900">{SITE_NAME}</div>
            <p className="mt-2 text-[13px] leading-7 text-slate-600">{SITE_TAGLINE}</p>
            <p className="mt-3 text-[13px] leading-7 text-slate-500">
              کالاها، قیمت‌ها و وضعیت موجودی را در کاتالوگ مشاهده کنید. مبلغ نهایی سفارش در مرحلهٔ تکمیل خرید از سرور محاسبه می‌شود.
            </p>
          </div>

          <nav aria-label="دسترسی‌های فروشگاه" className="lg:col-span-3">
            <h2 className="font-black text-sm text-slate-900">دسترسی سریع</h2>
            <ul className="mt-4 space-y-3 text-[13px] text-slate-600">
              <li><Link to={ROUTES.home} state={{ scrollToCategories: true }} className="hover:text-[#C2410C] focus-visible:underline">دسته‌بندی کالاها</Link></li>
              <li><Link to={ROUTES.search} className="hover:text-[#C2410C] focus-visible:underline">جستجوی کالا</Link></li>
              <li><Link to={ROUTES.cart} className="inline-flex items-center gap-2 hover:text-[#C2410C] focus-visible:underline"><ShoppingBag size={15} aria-hidden="true" /> سبد خرید</Link></li>
              <li><Link to={ROUTES.account} className="inline-flex items-center gap-2 hover:text-[#C2410C] focus-visible:underline"><UserRound size={15} aria-hidden="true" /> حساب کاربری</Link></li>
            </ul>
          </nav>

          <div className="lg:col-span-4">
            <h2 className="font-black text-sm text-slate-900">ارتباط با فروشگاه</h2>
            {hasContactBlock ? (
              <address className="mt-4 not-italic text-[13px] leading-7 text-slate-600">
                {SITE_ADDRESS_LINE !== null && (
                  <div className="flex items-start gap-2"><MapPin size={16} aria-hidden="true" className="mt-1 shrink-0 text-[#C2410C]" /> {SITE_ADDRESS_LINE}</div>
                )}
                {SITE_POSTAL_CODE !== null && <div>کد پستی: {toPersianDigits(SITE_POSTAL_CODE)}</div>}
                {SITE_PHONE !== null && (
                  <a href={`tel:${SITE_PHONE}`} className="inline-flex items-center gap-2 hover:text-[#C2410C] focus-visible:underline" dir="ltr">
                    <Phone size={15} aria-hidden="true" /> {SITE_PHONE_PERSIAN}
                  </a>
                )}
              </address>
            ) : (
              <p className="mt-4 text-[13px] leading-7 text-slate-500">
                اطلاعات تماس فروشگاه هنوز منتشر نشده است.
              </p>
            )}
          </div>
        </div>
        <div className="border-t border-slate-100 py-5 text-xs text-slate-500">
          © {toPersianDigits(currentJalaliYear())} {SITE_NAME} — کلیه حقوق محفوظ است.
        </div>
      </div>
    </footer>
  )
}
