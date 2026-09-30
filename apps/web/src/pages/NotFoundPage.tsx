import { Link } from 'react-router-dom'
import { SearchX } from 'lucide-react'
import { ROUTES } from '../lib/routes'
import { useDocumentMeta } from '../lib/use-document-meta'

/**
 * Real 404.
 *
 * A dead end with only a "back home" button strands a visitor who followed a bad
 * link, so the page offers the storefront's actual destinations plus a way to
 * search instead of guessing what they were looking for.
 */
const destinations = [
  { to: ROUTES.categories, label: 'دسته‌بندی کالاها', hint: 'مرور ابزار بر پایهٔ دسته' },
  { to: ROUTES.products, label: 'همه کالاها', hint: 'کل کاتالوگ با قیمت و موجودی زنده' },
  { to: ROUTES.newest, label: 'تازه‌های فروشگاه', hint: 'جدیدترین کالاهای ثبت‌شده' },
  { to: ROUTES.services, label: 'خدمات فروشگاه', hint: 'پیگیری سفارش، ورود با پیامک و بیشتر' },
] as const

export function NotFoundPage() {
  useDocumentMeta({ title: 'صفحه یافت نشد', noindex: true })

  return (
    <div className="max-w-[1280px] mx-auto px-4 lg:px-6 py-16 text-center">
      <div className="mx-auto w-20 h-20 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
        <SearchX size={34} aria-hidden="true" />
      </div>
      <h1 className="mt-5 font-black text-slate-900 text-xl lg:text-2xl">صفحه‌ای پیدا نشد</h1>
      <p className="mt-2 text-slate-500 text-sm">آدرس مورد نظر شما در فروشگاه یافت نشد.</p>

      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link
          to={ROUTES.home}
          className="inline-flex items-center gap-2 h-11 px-6 rounded-full bg-[#0F172A] text-white font-bold hover:bg-black transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
        >
          بازگشت به صفحه اصلی
        </Link>
        <Link
          to={ROUTES.search}
          className="inline-flex items-center gap-2 h-11 px-6 rounded-full border border-slate-200 bg-white text-slate-700 font-bold hover:border-slate-900 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4D00] focus-visible:ring-offset-2"
        >
          جست‌وجو در فروشگاه
        </Link>
      </div>

      <nav aria-label="مقصدهای پیشنهادی" className="mt-10">
        <h2 className="text-xs font-bold text-slate-500">می‌توانید از این بخش‌ها ادامه دهید</h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-right">
          {destinations.map(destination => (
            <li key={destination.to}>
              <Link
                to={destination.to}
                className="block h-full rounded-3xl border border-slate-100 bg-white p-5 transition hover:border-slate-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4D00]"
              >
                <span className="block font-black text-slate-900 text-sm">{destination.label}</span>
                <span className="block mt-1 text-[13px] leading-6 text-slate-500">{destination.hint}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
