import { Link } from 'react-router-dom'
import { Star } from 'lucide-react'
import type { CatalogProduct } from '../../services/catalog/types'
import { formatToman, toPersianDigits } from '../../lib/format'
import { ROUTES } from '../../lib/routes'

const STOCK_LABEL: Record<CatalogProduct['stockStatus'], string> = {
  IN_STOCK: 'موجود',
  LOW_STOCK: 'فقط چند عدد باقی مانده',
  OUT_OF_STOCK: 'ناموجود',
}

const STOCK_CLASS: Record<CatalogProduct['stockStatus'], string> = {
  IN_STOCK: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  LOW_STOCK: 'bg-amber-50 text-amber-700 border-amber-200',
  OUT_OF_STOCK: 'bg-slate-100 text-slate-500 border-slate-200',
}

export function ProductCard({ product }: { product: CatalogProduct }) {
  const oldToman = product.oldPrice ? product.oldPrice.amount : null

  return (
    <Link
      to={ROUTES.product(product.slug)}
      className="group flex flex-col rounded-[20px] border border-slate-100 bg-white overflow-hidden hover:shadow-lg hover:border-slate-200 transition motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4D00] focus-visible:ring-offset-2"
    >
      <div className="relative aspect-[4/3] bg-slate-50 overflow-hidden">
        <img
          src={product.image}
          alt={product.name}
          className="w-full h-full object-cover group-hover:scale-105 transition duration-500 motion-reduce:transition-none"
          loading="lazy"
        />
        {product.badge && (
          <span className="absolute top-2 right-2 px-2.5 py-1 rounded-full bg-[#C2410C] text-white text-[11px] font-black">
            {product.badge}
          </span>
        )}
      </div>

      <div className="flex flex-col flex-1 p-4">
        {product.brand && (
          <div className="text-xs font-bold text-slate-500">{product.brand}</div>
        )}
        <h3 className="text-[13px] font-bold leading-5 text-slate-900 line-clamp-2 min-h-[40px]">
          {product.name}
        </h3>

        <div className="flex items-center gap-1 mt-1.5 text-xs" aria-hidden="true">
          <Star size={12} className="fill-amber-400 text-amber-400" />
          <span className="font-bold text-slate-900">
            {product.rating != null ? toPersianDigits(product.rating) : '—'}
          </span>
          <span className="text-slate-500">({toPersianDigits(product.reviews)})</span>
        </div>

        <div className="mt-3 flex items-baseline gap-1.5">
          <span className="font-black text-[15px] text-slate-900">{formatToman(product.price.amount)}</span>
        </div>
        {oldToman != null && (
          <div className="text-xs text-slate-400 line-through">{formatToman(oldToman)}</div>
        )}

        <div className={`mt-3 inline-flex self-start px-2.5 py-1 rounded-full text-[11px] font-bold border ${STOCK_CLASS[product.stockStatus]}`}>
          {STOCK_LABEL[product.stockStatus]}
        </div>
      </div>
    </Link>
  )
}
