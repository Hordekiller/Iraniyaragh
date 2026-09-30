import { Link } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import type { CatalogCategory } from '../../services/catalog/types'
import { ROUTES } from '../../lib/routes'

/**
 * Root-to-leaf category trail for the product detail page.
 *
 * Every crumb is a real category from the live catalog list, so the trail can
 * never imply a hierarchy the API does not deliver.
 */
export function ProductBreadcrumb({
  trail,
  productName,
}: {
  trail: readonly CatalogCategory[]
  productName: string
}) {
  return (
    <nav aria-label="مسیر محصول" className="text-xs text-slate-400 mb-4">
      <ol className="flex flex-wrap items-center gap-1">
        <li className="flex items-center gap-1">
          <Link to={ROUTES.home} className="hover:text-[#FF4D00]">خانه</Link>
        </li>
        {trail.map(category => (
          <li key={category.id} className="flex items-center gap-1">
            <ChevronLeft size={12} aria-hidden="true" className="text-slate-300" />
            <Link to={ROUTES.category(category.slug)} className="hover:text-[#FF4D00]">
              {category.name}
            </Link>
          </li>
        ))}
        <li className="flex items-center gap-1">
          <ChevronLeft size={12} aria-hidden="true" className="text-slate-300" />
          <span aria-current="page" className="text-slate-600 font-bold">{productName}</span>
        </li>
      </ol>
    </nav>
  )
}
