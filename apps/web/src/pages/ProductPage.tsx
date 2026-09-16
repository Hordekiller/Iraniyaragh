import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Minus, Plus, Star, Truck, ShieldCheck, ShoppingBag } from 'lucide-react'
import { useCatalogApi } from '../state/catalog-context'
import { useCart } from '../state/cart-context'
import { useToast } from '../components/feedback/toast-context'
import { formatToman, toPersianDigits } from '../lib/format'
import { FREE_SHIPPING_THRESHOLD_RIALS, SHIPPING_COST_RIALS } from '../lib/site-config'
import { ROUTES } from '../lib/routes'
import type { CatalogProduct } from '../services/catalog/types'
import type { CartLine } from '../services/cart/types'

const STOCK_LABEL: Record<CatalogProduct['stockStatus'], string> = {
  IN_STOCK: 'موجود در انبار',
  LOW_STOCK: 'فقط چند عدد باقی مانده',
  OUT_OF_STOCK: 'ناموجود',
  UNKNOWN: 'موجودی در حال بررسی',
}

export function ProductPage() {
  const api = useCatalogApi()
  const { add, setQuantity, quantityOf, isInCart } = useCart()
  const { show } = useToast()
  const navigate = useNavigate()
  const { slug = '' } = useParams<{ slug: string }>()

  const [product, setProduct] = useState<CatalogProduct | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const [resolvedSlug, setResolvedSlug] = useState(slug)
  if (resolvedSlug !== slug) {
    setResolvedSlug(slug)
    setProduct(null)
    setLoading(true)
    setNotFound(false)
  }

  useEffect(() => {
    let cancelled = false
    api
      .getProductBySlug(slug)
      .then(p => {
        if (cancelled) return
        setProduct(p)
        setLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setNotFound(true)
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [api, slug])

  if (loading) return <div className="max-w-[1280px] mx-auto px-4 py-10 text-slate-500">در حال بارگذاری...</div>

  if (notFound || !product) {
    return (
      <div className="max-w-[1280px] mx-auto px-4 py-20 text-center">
        <h1 className="font-black text-slate-900 text-xl">محصول یافت نشد</h1>
        <p className="mt-2 text-slate-500 text-sm">محصول موردنظر موجود نیست یا آدرس آن تغییر کرده است.</p>
        <Link to={ROUTES.home} className="inline-flex items-center gap-2 mt-6 h-11 px-6 rounded-full bg-[#0F172A] text-white font-bold">
          <ArrowLeft size={16} /> بازگشت به فروشگاه
        </Link>
      </div>
    )
  }

  const item = product

  const inCart = isInCart(item.id)
  const qty = quantityOf(item.id)
  const available = item.stockStatus === 'IN_STOCK' || item.stockStatus === 'LOW_STOCK'
  const discountPercent =
    product.oldPrice && Number(product.oldPrice.amount) > 0
      ? Math.round((1 - Number(product.price.amount) / Number(product.oldPrice.amount)) * 100)
      : 0

  function handleAdd() {
    if (!available) return
    const line: CartLine = {
      productId: item.id,
      slug: item.slug,
      name: item.name,
      brand: item.brand,
      image: item.image,
      unitPrice: item.price,
      oldPrice: item.oldPrice,
      quantity: 1,
    }
    add(line)
    show('به سبد خرید افزوده شد')
  }

  return (
    <div className="max-w-[1280px] mx-auto px-4 lg:px-6 py-6">
      <nav aria-label="مسیر محصول" className="text-xs text-slate-400 mb-4">
        <Link to={ROUTES.home} className="hover:text-[#FF4D00]">خانه</Link>
        <span className="mx-1">/</span>
        {product.category && (
          <>
            <Link to={ROUTES.category(product.category.slug)} className="hover:text-[#FF4D00]">
              {product.category.name}
            </Link>
            <span className="mx-1">/</span>
          </>
        )}
        <span className="text-slate-600 font-bold">{product.name}</span>
      </nav>

      <div className="grid lg:grid-cols-2 gap-8">
        <div className="relative rounded-[28px] bg-slate-50 overflow-hidden lg:sticky lg:top-24 self-start">
          <img src={product.image} alt={product.name} className="w-full aspect-square object-cover" />
          {product.badge && (
            <span className="absolute top-4 left-4 px-3 py-1.5 rounded-full bg-[#C2410C] text-white text-xs font-black">
              {product.badge}
            </span>
          )}
        </div>

        <div>
          <nav className="flex items-center gap-2">
            {product.brand && <span className="text-sm font-black text-slate-500">{product.brand}</span>}
            <span className="px-2.5 py-1 rounded-full text-[11px] font-bold border border-slate-200 text-slate-600">
              {STOCK_LABEL[product.stockStatus]}
            </span>
          </nav>

          <h1 className="mt-3 font-black text-lg lg:text-2xl leading-8 text-slate-900">{product.name}</h1>

          {product.rating != null && (
            <div className="flex items-center gap-1.5 mt-2 text-sm">
              <div role="img" aria-label={`${product.rating} از ۵ ستاره`} className="flex" aria-hidden="true">
                {[1, 2, 3, 4, 5].map(n => (
                  <Star key={n} size={14} className={n <= Math.round(product.rating!) ? 'fill-amber-400 text-amber-400' : 'fill-slate-200 text-slate-200'} />
                ))}
              </div>
              <span className="font-bold text-slate-900">{toPersianDigits(product.rating)}</span>
              <span className="text-slate-400">({toPersianDigits(product.reviews)} نظر)</span>
            </div>
          )}

          {product.description && (
            <p className="mt-4 text-[13px] leading-7 text-slate-500">{product.description}</p>
          )}

          <div className="mt-5 flex items-baseline gap-3">
            <span className="font-black text-[22px] text-slate-900">{formatToman(product.price.amount)}</span>
            {product.oldPrice && (
              <>
                <span className="text-sm text-slate-400 line-through">{formatToman(product.oldPrice.amount)}</span>
                <span className="px-2 py-1 rounded-full bg-red-500 text-white text-xs font-black">٪{toPersianDigits(discountPercent)} تخفیف</span>
              </>
            )}
          </div>

          <div className="mt-6 flex items-center gap-3">
            {inCart ? (
              <div className="flex items-center gap-3 rounded-full border-2 border-[#0F172A] p-1">
                <button
                  type="button"
                  onClick={() => setQuantity(product.id, qty + 1)}
                  aria-label="افزایش تعداد"
                  className="w-10 h-10 rounded-full bg-[#0F172A] text-white flex items-center justify-center hover:bg-black disabled:opacity-40"
                  disabled={!available}
                >
                  <Plus size={18} aria-hidden="true" />
                </button>
                <span className="min-w-[24px] text-center font-black" aria-label={toPersianDigits(qty)}>
                  {toPersianDigits(qty)}
                </span>
                <button
                  type="button"
                  onClick={() => setQuantity(product.id, qty - 1)}
                  aria-label="کاهش تعداد"
                  className="w-10 h-10 rounded-full bg-slate-100 text-slate-900 flex items-center justify-center hover:bg-slate-200"
                >
                  <Minus size={18} aria-hidden="true" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleAdd}
                disabled={!available}
                className="flex-1 h-12 rounded-full bg-[#FF4D00] text-white font-black hover:bg-[#E54400] disabled:bg-slate-300 disabled:cursor-not-allowed transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4D00] focus-visible:ring-offset-2"
              >
                <span className="inline-flex items-center gap-2">
                  <ShoppingBag size={18} aria-hidden="true" />
                  {available ? 'افزودن به سبد خرید' : 'ناموجود'}
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={() => navigate(ROUTES.cart)}
              className="h-12 px-6 rounded-full border-2 border-slate-900 font-black hover:bg-slate-900 hover:text-white transition"
            >
              مشاهده سبد
            </button>
          </div>

          <div className="flex items-center justify-center gap-5 mt-6 text-xs text-slate-400 rounded-2xl bg-slate-50 py-3">
            <span className="flex items-center gap-1.5"><Truck size={15} /> {product && Number(product.price.amount) >= FREE_SHIPPING_THRESHOLD_RIALS ? 'ارسال رایگان' : `ارسال ${formatToman(SHIPPING_COST_RIALS)}`}</span>
            <span className="flex items-center gap-1.5"><ShieldCheck size={15} /> ضمانت اصالت کالا</span>
          </div>
        </div>
      </div>
    </div>
  )
}
