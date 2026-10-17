import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ROUTES } from '../../lib/routes'
import type { CatalogCategory } from '../../services/catalog/types'

export function CategoryGrid({ categories }: { categories: CatalogCategory[] }) {
  return (
    <div className="mt-5 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 lg:gap-4">
      {categories.map(category => (
        <Link key={category.id} to={ROUTES.category(category.slug)} className="group flex min-h-28 items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white p-4 hover:border-[#FF4D00]/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4D00]">
          <span className="font-bold text-slate-900">{category.name}</span>
          <ArrowLeft size={18} aria-hidden="true" className="shrink-0 text-[#C2410C]" />
        </Link>
      ))}
    </div>
  )
}
