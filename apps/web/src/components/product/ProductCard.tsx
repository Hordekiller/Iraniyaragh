'use client'

import { useState, useSyncExternalStore } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Heart, Star, Store } from 'lucide-react'
import type { CatalogProduct } from '../../services/catalog/types'
import { formatToman, toPersianDigits } from '../../lib/format'
import { ROUTES } from '../../lib/routes'
import { verifiedDiscountPercent } from '../../lib/discount'
import { campaignBadgeFor } from '../../lib/campaign'
import { useCampaigns } from '../../state/use-campaigns'
import { useCart } from '../../state/cart-context'
import { shopEvent } from '../analytics/shop-events'
import { useToast } from '../feedback/toast-context'
import { commerceErrorMessage } from '../../services/commerce/errors'
import { VariantSelect } from './VariantSelect'
import { setWishlisted, subscribeWishlist, wishlistSlugs } from '../../lib/wishlist'
import { useShopNavigation } from '../../lib/shop-navigation'

const STOCK_LABEL: Record<CatalogProduct['stockStatus'], string> = {
  IN_STOCK: 'موجود',
  LOW_STOCK: 'فقط چند عدد باقی مانده',
  OUT_OF_STOCK: 'ناموجود',
  UNKNOWN: 'وضعیت موجودی در دسترس نیست',
}

const STOCK_CLASS: Record<CatalogProduct['stockStatus'], string> = {
  IN_STOCK: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  LOW_STOCK: 'bg-amber-50 text-amber-700 border-amber-200',
  OUT_OF_STOCK: 'bg-slate-100 text-slate-700 border-slate-200',
  UNKNOWN: 'bg-slate-100 text-slate-700 border-slate-200',
}

type CardVariant = 'default' | 'offer' | 'shop'

function PurchaseButtons({ product }: { product: CatalogProduct }) {
  const { state, add } = useCart()
  const { show } = useToast()
  const navigate = useNavigate()
  const [selectedId, setSelectedId] = useState(product.variants[0]?.id ?? '')
  const [busy, setBusy] = useState(false)
  const selected = product.variants.find(variant => variant.id === selectedId)
  const sellable = selected && (selected.stockStatus === 'IN_STOCK' || selected.stockStatus === 'LOW_STOCK')
  const cartBusy = busy || state.phase === 'idle' || state.phase === 'loading' || state.phase === 'merging' || (selected ? state.pendingVariantIds.includes(selected.id) : false)

  async function purchase(quick: boolean) {
    if (!sellable || cartBusy) return
    setBusy(true)
    try {
      const added = await add(selected.id, 1)
      if (added) {
        show('به سبد خرید افزوده شد')
        shopEvent('add_to_cart', { items: [{ item_id: product.id, quantity: 1 }] })
        if (quick) void navigate(ROUTES.cart)
      }
    } catch (error) {
      show(commerceErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-auto space-y-2">
      <VariantSelect variants={product.variants} value={selectedId} onChange={setSelectedId} />
      <div className="flex gap-2">
        <button type="button" onClick={() => void purchase(false)} disabled={!sellable || cartBusy} className="min-h-11 min-w-0 flex-[3] rounded-xl bg-[#FF4D00] px-1 text-[11px] font-black text-white hover:bg-[#C2410C] disabled:cursor-not-allowed disabled:bg-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4D00]">افزودن به سبد</button>
        <button type="button" onClick={() => void purchase(true)} disabled={!sellable || cartBusy} className="min-h-11 min-w-0 flex-[2] rounded-xl bg-orange-50 px-1 text-[11px] font-black text-[#9A3412] hover:bg-orange-100 disabled:cursor-not-allowed disabled:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4D00]">خرید سریع</button>
      </div>
    </div>
  )
}

export function ProductCard({ product, variant = 'default' }: { product: CatalogProduct; variant?: CardVariant }) {
  const [wishlistError, setWishlistError] = useState(false)
  const wishlisted = useSyncExternalStore(subscribeWishlist, () => wishlistSlugs().includes(product.slug), () => false)
  const shopMode = useShopNavigation()
  const discount = verifiedDiscountPercent(product)
  const campaign = campaignBadgeFor(product, useCampaigns())
  const oldToman = discount !== null && product.oldPrice ? product.oldPrice.amount : null
  const soldOut = product.stockStatus === 'OUT_OF_STOCK'
  const href = ROUTES.product(product.slug)
  const shop = variant === 'shop'
  const fallbackPurchase = product.variants.length === 0

  return (
    <article data-shop-product={product.id} className={`group flex h-full min-w-0 flex-col overflow-hidden rounded-[20px] border bg-white transition hover:shadow-lg motion-reduce:transition-none ${variant === 'offer' ? 'border-orange-200 hover:border-orange-300' : 'border-slate-100 hover:border-slate-200'}`}>
      {wishlistError && <p role="alert" className="p-2 text-xs text-red-800">ذخیرهٔ علاقه‌مندی انجام نشد؛ دوباره تلاش کنید.</p>}
      <div className={`relative aspect-square overflow-hidden bg-slate-100 ${shop ? 'm-2 rounded-2xl lg:m-0 lg:rounded-none' : ''} lg:aspect-[4/3] lg:bg-white`}>
        <Link to={href} aria-label={`مشاهده تصویر ${product.name}`} className="block h-full w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#FF4D00]">
          <img src={product.image} alt={product.name} width={400} height={400} decoding="async" loading="lazy" className={`h-full w-full object-contain p-3 transition duration-500 group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100 lg:p-2 ${soldOut ? 'opacity-60' : ''}`} />
        </Link>
        {shopMode && <button type="button" aria-label={`${wishlisted ? 'حذف از' : 'افزودن به'} علاقه‌مندی‌ها: ${product.name}`} aria-pressed={wishlisted} onClick={() => { setWishlistError(false); void setWishlisted(product.slug, !wishlisted).catch(() => setWishlistError(true)) }} className="absolute bottom-2 left-2 flex size-11 items-center justify-center rounded-full bg-white/95 text-orange-800 shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-700"><Heart size={19} aria-hidden="true" fill={wishlisted ? 'currentColor' : 'none'} /></button>}
        {discount !== null && <span className="absolute top-2 left-2 rounded-full bg-[#C2410C] px-2 py-1 text-[10px] font-black text-white lg:px-2.5 lg:text-[11px]">{toPersianDigits(discount)}٪ تخفیف</span>}
        {campaign && <span className={`absolute bottom-2 right-2 rounded-full px-2 py-1 text-[10px] font-black text-white lg:px-2.5 lg:text-[11px] ${campaign.scheduled ? 'bg-slate-700' : 'bg-emerald-700'}`}>{campaign.label}</span>}
        {product.badge && !(discount !== null && product.badge.includes('تخفیف')) && <span className="absolute top-2 right-2 rounded-full bg-[#C2410C] px-2 py-1 text-[10px] font-black text-white lg:px-2.5 lg:text-[11px]">{product.badge}</span>}
      </div>

      <div className={`flex min-w-0 flex-1 flex-col ${shop ? 'p-2 pt-1' : 'p-3'} lg:p-4`}>
        <div className="hidden min-h-4 text-xs font-bold text-slate-500 lg:block">{product.brand}</div>
        <h3 className={`line-clamp-2 min-h-10 text-[13px] font-bold leading-5 text-slate-900 ${shop ? 'text-start' : 'text-center'} lg:text-start`}>
          <Link to={href} className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4D00]">{product.name}</Link>
        </h3>
        {product.rating != null && product.reviews > 0 && <div className="mt-1.5 hidden items-center gap-1 text-xs lg:flex"><Star size={12} aria-hidden="true" className="fill-amber-400 text-amber-400" /><span className="font-bold text-slate-900">{toPersianDigits(product.rating)}</span><span className="text-slate-600">({toPersianDigits(product.reviews)})</span></div>}

        {shop ? (
          <div className="mt-auto flex min-h-12 items-center justify-between gap-1 rounded-xl bg-orange-50 p-1.5 lg:hidden">
            <span className="min-w-0 text-[12px] font-black text-slate-900">{product.priceAvailable === false ? 'قیمت در دسترس نیست' : <>{formatToman(product.price.amount)}</>}</span>
            <Link to={href} aria-label={`مشاهده ${product.name}`} className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#FF4D00] text-white hover:bg-[#C2410C] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4D00] focus-visible:ring-offset-2"><Store size={20} aria-hidden="true" /></Link>
          </div>
        ) : (
          <div className="flex flex-1 flex-col lg:hidden">
            <div className={`mt-2 flex items-center justify-center gap-1 text-[10px] font-bold ${STOCK_CLASS[product.stockStatus].split(' ').find(c => c.startsWith('text-'))}`}><span className={`size-2 rounded-full ${soldOut || product.stockStatus === 'UNKNOWN' ? 'bg-slate-400' : product.stockStatus === 'LOW_STOCK' ? 'bg-amber-500' : 'bg-emerald-600'}`} aria-hidden="true" />{STOCK_LABEL[product.stockStatus]}</div>
            <div className="mt-2 text-center"><strong className="block text-[15px] font-black text-slate-900">{product.priceAvailable === false ? 'قیمت در دسترس نیست' : formatToman(product.price.amount)}</strong>{oldToman != null && <span className="text-xs text-slate-500 line-through">{formatToman(oldToman)}</span>}</div>
            {fallbackPurchase ? <div className="mt-auto pt-2"><Link to={href} className="flex min-h-11 items-center justify-center rounded-xl bg-[#FF4D00] px-2 text-center text-[11px] font-black text-white hover:bg-[#C2410C] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4D00]">مشاهده محصول</Link></div> : <PurchaseButtons product={product} />}
          </div>
        )}

        <div className="hidden lg:flex lg:flex-1 lg:flex-col"><div className="mt-3 mb-3 flex items-baseline gap-1.5"><span className="text-[15px] font-black text-slate-900">{product.priceAvailable === false ? 'قیمت در دسترس نیست' : formatToman(product.price.amount)}</span></div>{oldToman != null && <div className="text-xs text-slate-600 line-through">{formatToman(oldToman)}</div>}<div className={`mt-auto inline-flex self-start rounded-full border px-2.5 py-1 text-[11px] font-bold ${STOCK_CLASS[product.stockStatus]}`}>{STOCK_LABEL[product.stockStatus]}</div></div>
      </div>
    </article>
  )
}
