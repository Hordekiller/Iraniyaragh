import { ProductCard } from './ProductCard'
import type { CatalogProduct } from '../../services/catalog/types'

export function ProductGrid({ products }: { products: CatalogProduct[] }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {products.map(product => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  )
}
