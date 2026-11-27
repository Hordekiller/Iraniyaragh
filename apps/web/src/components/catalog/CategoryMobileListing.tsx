'use client'
import { ProductGrid } from '../product/ProductGrid'
import type { CatalogListResult } from '../../services/catalog/types'
/** Sorting/filtering belong to the URL-addressable server collection, before pagination. */
export function CategoryMobileListing({ initialResult }: { categoryId: string; page: number; initialResult: CatalogListResult }) {
  return <div className="lg:hidden"><p className="text-sm">{initialResult.meta.total.toLocaleString('fa-IR')} کالا</p><ProductGrid products={initialResult.items} /></div>
}
