'use client'

import { LayoutGrid } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ROUTES } from '../../lib/routes'
import { toPersianDigits } from '../../lib/format'
import type { CatalogCategory } from '../../services/catalog/types'

export function CategoryChips({ categories, activeId }: { categories: CatalogCategory[]; activeId: string | null }) {
  return (
    <nav aria-label="دسته‌بندی‌های کالا" className="-mx-4 mt-5 overflow-x-auto px-4 pb-2 lg:hidden [scrollbar-width:thin]">
      <div className="flex w-max gap-2">
        {categories.map(category => (
          <Link key={category.id} to={ROUTES.category(category.slug)} aria-current={category.id === activeId ? 'page' : undefined} className={`flex min-h-14 items-center gap-2 rounded-2xl border px-2.5 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4D00] ${category.id === activeId ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-900 hover:border-orange-300'}`}>
            {category.image ? <img src={category.image} alt="" width={36} height={36} loading="lazy" className="size-9 rounded-lg bg-slate-100 object-cover" /> : <LayoutGrid size={22} aria-hidden="true" />}
            <span className="max-w-32 font-bold">{category.name}<span className={`block text-[10px] font-medium ${category.id === activeId ? 'text-slate-200' : 'text-slate-500'}`}>{toPersianDigits(category.productCount)} کالا</span></span>
          </Link>
        ))}
      </div>
    </nav>
  )
}
