'use client'

import { ProductCard } from './ProductCard'
import type { CatalogProduct } from '../../services/catalog/types'

export function ProductGrid({ products }: { products: CatalogProduct[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 lg:grid-cols-4">
      {products.map(product => (
        <ProductCard key={product.id} product={product} variant="shop" />
      ))}
    </div>
  )
}
