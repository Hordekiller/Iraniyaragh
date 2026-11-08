import { Link } from 'react-router-dom'
import { ArrowLeft, BookOpen } from 'lucide-react'
import { useHasBlog } from '../../lib/blog-nav-context'
import { ROUTES } from '../../lib/routes'

/** The shared server-resolved publication state also controls header, drawer and footer. */
export function HomeBlogSection() {
  const hasBlog = useHasBlog()
  if (!hasBlog) return null
  return <section aria-labelledby="home-content-title" className="mx-auto mt-6 max-w-[1280px] px-4 lg:px-6">
    <div className="flex flex-col gap-5 rounded-2xl border border-orange-100 bg-orange-50 p-5 sm:flex-row sm:items-center sm:justify-between lg:p-7">
      <div className="min-w-0">
        <h2 id="home-content-title" className="flex items-center gap-2 text-xl font-black text-slate-900"><BookOpen size={22} aria-hidden="true" className="shrink-0 text-orange-800" /> محتوا و راهنماها</h2>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-700">مقالات منتشرشدهٔ فروشگاه دربارهٔ انتخاب و استفاده از ابزار و یراق‌آلات را بخوانید.</p>
      </div>
      <Link to={ROUTES.blog} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-orange-800 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-orange-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-800">مشاهدهٔ مقالات و راهنماها <ArrowLeft size={18} aria-hidden="true" /></Link>
    </div>
  </section>
}
