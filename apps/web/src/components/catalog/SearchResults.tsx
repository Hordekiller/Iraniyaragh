import { Search, SearchX } from 'lucide-react'
import { bestSellers, popularProducts, specialProducts } from '../../data/prototype'
import type { Product } from '../../types/content'
import { formatToman } from '../../lib/carousel'

const ALL_PRODUCTS: Product[] = [...popularProducts, ...bestSellers, ...specialProducts]

function matchesQuery(product: Product, query: string): boolean {
  const haystack = `${product.title} ${product.brand} ${product.cat}`.toLowerCase()
  return query.split(/\s+/).every(token => haystack.includes(token.toLowerCase()))
}

type SearchResultsProps = {
  query: string
  onSelectProduct: (product: Product) => void
}

export function SearchResults({ query, onSelectProduct }: SearchResultsProps) {
  if (!query) return null

  const results = ALL_PRODUCTS.filter(p => matchesQuery(p, query))

  return (
    <section aria-live="polite" className="max-w-[1280px] mx-auto px-4 lg:px-6 mt-6">
      <div className="bg-white rounded-[24px] lg:rounded-[28px] p-4 lg:p-6">
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 rounded-2xl bg-[#0F172A] text-white flex items-center justify-center"><Search size={20} /></div>
          <div>
            <h3 className="font-black text-[18px] lg:text-[20px] leading-none text-slate-900">نتایج جستجو برای «{query}»</h3>
            <p className="text-slate-500 text-xs lg:text-[13px] mt-1">{results.length.toLocaleString('fa-IR')} کالا یافت شد</p>
          </div>
        </div>

        {results.length === 0 ? (
          <div className="mt-6 py-10 flex flex-col items-center gap-3 text-center">
            <SearchX size={32} className="text-slate-300" />
            <p className="font-bold text-slate-700">کالایی مطابق با «{query}» پیدا نشد</p>
            <p className="text-xs text-slate-400">عبارت دیگری را امتحان کنید؛ نمونه: دریل، فرز، رونیکس</p>
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {results.map(p => (
              <div key={`search-${p.id}`} onClick={() => onSelectProduct(p)} className="bg-slate-50 rounded-[20px] border border-slate-100 hover:border-[#FF4D00]/20 hover:shadow-lg hover:shadow-[#FF4D00]/5 transition cursor-pointer group overflow-hidden">
                <div className="relative h-[120px] lg:h-[140px] bg-white flex items-center justify-center overflow-hidden">
                  <img src={p.image} alt={p.title} className="w-full h-full object-cover group-hover:scale-105 transition duration-500" />
                  {p.badge && <span className="absolute top-2 right-2 px-2 py-1 rounded-full bg-[#FF4D00] text-white text-[10px] font-black">{p.badge}</span>}
                </div>
                <div className="p-3">
                  <div className="text-[11px] font-bold text-slate-400 tracking-widest">{p.brand}</div>
                  <div className="text-[13px] font-bold leading-5 text-slate-900 line-clamp-2 min-h-[40px]">{p.title}</div>
                  <div className="mt-2 flex items-end justify-between">
                    <div>
                      <div className="text-[#0F172A] font-black text-[15px] leading-none">{formatToman(p.price)} <span className="text-[10px] font-bold">تومان</span></div>
                      {p.oldPrice && <div className="text-xs text-slate-400 line-through mt-0.5">{formatToman(p.oldPrice)}</div>}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}