import { Link } from 'react-router-dom'
import { SearchX } from 'lucide-react'
import { ROUTES } from '../lib/routes'

export function NotFoundPage() {
  return (
    <div className="max-w-[1280px] mx-auto px-4 py-24 text-center">
      <div className="mx-auto w-20 h-20 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
        <SearchX size={34} aria-hidden="true" />
      </div>
      <h1 className="mt-5 font-black text-slate-900 text-2xl">صفحه‌ای پیدا نشد</h1>
      <p className="mt-2 text-slate-500 text-sm">آدرس مورد نظر شما در فروشگاه یافت نشد.</p>
      <Link
        to={ROUTES.home}
        className="inline-flex items-center gap-2 mt-6 h-11 px-6 rounded-full bg-[#0F172A] text-white font-bold hover:bg-black transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
      >
        بازگشت به صفحه اصلی
      </Link>
    </div>
  )
}
