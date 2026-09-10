import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
<<<<<<< HEAD
import {
  ArrowLeft,
  Minus,
  Plus,
  Star,
  Truck,
  ShieldCheck,
  ShoppingBag,
} from 'lucide-react'
=======
import { ArrowLeft, Minus, Plus, Star, Truck, ShieldCheck, ShoppingBag } from 'lucide-react'
>>>>>>> b2d024c (feat(web): harden storefront purchase flow)
import { useCatalogApi } from '../state/catalog-context'
import { useCart } from '../state/cart-context'
import { useToast } from '../components/feedback/toast-context'
import { formatToman, toPersianDigits } from '../lib/format'
<<<<<<< HEAD
import { ROUTES } from '../lib/routes'
import { MediaGallery } from '../components/product/MediaGallery'
import { RichText } from '../components/product/RichText'
import { serializeJsonLd } from '../lib/json-ld'
import { richTextToPlainText } from '../lib/rich-text'
import type { CatalogProduct } from '../services/catalog/types'
import { commerceErrorMessage } from '../services/commerce/errors'
=======
import { FREE_SHIPPING_THRESHOLD_RIALS, SHIPPING_COST_RIALS } from '../lib/site-config'
import { ROUTES } from '../lib/routes'
import type { CatalogProduct } from '../services/catalog/types'
import type { CartLine } from '../services/cart/types'
>>>>>>> b2d024c (feat(web): harden storefront purchase flow)

const STOCK_LABEL: Record<CatalogProduct['stockStatus'], string> = {
  IN_STOCK: 'موجود در انبار',
  LOW_STOCK: 'فقط چند عدد باقی مانده',
  OUT_OF_STOCK: 'ناموجود',
<<<<<<< HEAD
  UNKNOWN: 'موجودی در حال بررسی',
=======
>>>>>>> b2d024c (feat(web): harden storefront purchase flow)
}

export function ProductPage() {
  const api = useCatalogApi()
<<<<<<< HEAD
  const { state: cartState, add, setQuantity, quantityOf, isInCart } = useCart()
=======
  const { add, setQuantity, quantityOf, isInCart } = useCart()
>>>>>>> b2d024c (feat(web): harden storefront purchase flow)
  const { show } = useToast()
  const navigate = useNavigate()
  const { slug = '' } = useParams<{ slug: string }>()

  const [product, setProduct] = useState<CatalogProduct | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
<<<<<<< HEAD
  const [selectedVariantId, setSelectedVariantId] = useState('')
=======
>>>>>>> b2d024c (feat(web): harden storefront purchase flow)

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
<<<<<<< HEAD
      .then((p) => {
        if (cancelled) return
        setProduct(p)
        const sellable = p.variants.find(
          (variant) =>
            variant.stockStatus === 'IN_STOCK' ||
            variant.stockStatus === 'LOW_STOCK',
        )
        setSelectedVariantId((sellable ?? p.variants[0])?.id ?? '')
=======
      .then(p => {
        if (cancelled) return
        setProduct(p)
>>>>>>> b2d024c (feat(web): harden storefront purchase flow)
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

<<<<<<< HEAD
  if (loading)
    return (
      <div className="max-w-[1280px] mx-auto px-4 py-10 text-slate-500">
        در حال بارگذاری...
      </div>
    )
=======
  if (loading) return <div className="max-w-[1280px] mx-auto px-4 py-10 text-slate-500">در حال بارگذاری...</div>
>>>>>>> b2d024c (feat(web): harden storefront purchase flow)

  if (notFound || !product) {
    return (
      <div className="max-w-[1280px] mx-auto px-4 py-20 text-center">
        <h1 className="font-black text-slate-900 text-xl">محصول یافت نشد</h1>
<<<<<<< HEAD
        <p className="mt-2 text-slate-500 text-sm">
          محصول موردنظر موجود نیست یا آدرس آن تغییر کرده است.
        </p>
        <Link
          to={ROUTES.home}
          className="inline-flex items-center gap-2 mt-6 h-11 px-6 rounded-full bg-[#0F172A] text-white font-bold"
        >
=======
        <p className="mt-2 text-slate-500 text-sm">محصول موردنظر موجود نیست یا آدرس آن تغییر کرده است.</p>
        <Link to={ROUTES.home} className="inline-flex items-center gap-2 mt-6 h-11 px-6 rounded-full bg-[#0F172A] text-white font-bold">
>>>>>>> b2d024c (feat(web): harden storefront purchase flow)
          <ArrowLeft size={16} /> بازگشت به فروشگاه
        </Link>
      </div>
    )
  }

  const item = product
<<<<<<< HEAD
  const selectedVariant =
    item.variants.find((variant) => variant.id === selectedVariantId) ??
    item.variants[0] ??
    null
  const inCart = selectedVariant ? isInCart(selectedVariant.id) : false
  const qty = selectedVariant ? quantityOf(selectedVariant.id) : 0
  const available =
    selectedVariant != null &&
    (selectedVariant.stockStatus === 'IN_STOCK' ||
      selectedVariant.stockStatus === 'LOW_STOCK')
  const cartBusy =
    cartState.phase === 'idle' ||
    cartState.phase === 'loading' ||
    cartState.phase === 'merging' ||
    (selectedVariant != null &&
      cartState.pendingVariantIds.includes(selectedVariant.id))
  const discountPercent =
    product.oldPrice && Number(product.oldPrice.amount) > 0
      ? Math.round(
          (1 -
            Number(selectedVariant?.price.amount ?? product.price.amount) /
              Number(product.oldPrice.amount)) *
            100,
        )
      : 0

  async function handleAdd() {
    if (!available || !selectedVariant) return
    try {
      const added = await add(selectedVariant.id)
      if (added) show('به سبد خرید افزوده شد')
    } catch (error) {
      show(commerceErrorMessage(error))
    }
  }

  // Structured data uses only values that actually exist in the API response;
  // counts and dates that are not returned are never invented (spec §7).
  const structuredData: Record<string, unknown>[] = []
  if (product.media.length > 0) {
    const imageUrls = product.media
      .filter((media) => media.kind === 'IMAGE')
      .flatMap((media) => media.sources.map((source) => source.url))
    const productData: Record<string, unknown> = {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: product.name,
      url: ROUTES.product(product.slug),
      image: imageUrls.length > 0 ? imageUrls : undefined,
    }
    if (product.description)
      productData.description = richTextToPlainText(product.description)
    structuredData.push(productData)
  }
  for (const media of product.media) {
    if (media.kind !== 'VIDEO') continue
    const videoData: Record<string, unknown> = {
      '@context': 'https://schema.org',
      '@type': 'VideoObject',
      name: `${product.name} — ویدیو`,
      description: media.description,
      thumbnailUrl: media.poster.sources.map((source) => source.url),
      contentUrl: media.sources[0]?.url,
    }
    if (media.durationMs > 0)
      videoData.duration = `PT${Math.round(media.durationMs / 1000)}S`
    structuredData.push(videoData)
=======

  const inCart = isInCart(item.id)
  const qty = quantityOf(item.id)
  const available = item.stockStatus !== 'OUT_OF_STOCK'
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
>>>>>>> b2d024c (feat(web): harden storefront purchase flow)
  }

  return (
    <div className="max-w-[1280px] mx-auto px-4 lg:px-6 py-6">
<<<<<<< HEAD
      {structuredData.length > 0 && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(structuredData) }}
        />
      )}
      <nav aria-label="مسیر محصول" className="text-xs text-slate-400 mb-4">
        <Link to={ROUTES.home} className="hover:text-[#FF4D00]">
          خانه
        </Link>
        <span className="mx-1">/</span>
        {product.category && (
          <>
            <Link
              to={ROUTES.category(product.category.slug)}
              className="hover:text-[#FF4D00]"
            >
=======
      <nav aria-label="مسیر محصول" className="text-xs text-slate-400 mb-4">
        <Link to={ROUTES.home} className="hover:text-[#FF4D00]">خانه</Link>
        <span className="mx-1">/</span>
        {product.category && (
          <>
            <Link to={ROUTES.category(product.category.slug)} className="hover:text-[#FF4D00]">
>>>>>>> b2d024c (feat(web): harden storefront purchase flow)
              {product.category.name}
            </Link>
            <span className="mx-1">/</span>
          </>
        )}
        <span className="text-slate-600 font-bold">{product.name}</span>
      </nav>

      <div className="grid lg:grid-cols-2 gap-8">
<<<<<<< HEAD
        <MediaGallery
          media={product.media}
          productName={product.name}
          badge={product.badge}
          fallbackImage={product.image}
        />

        <div>
          <nav className="flex items-center gap-2">
            {product.brand && (
              <span className="text-sm font-black text-slate-500">
                {product.brand}
              </span>
            )}
=======
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
>>>>>>> b2d024c (feat(web): harden storefront purchase flow)
            <span className="px-2.5 py-1 rounded-full text-[11px] font-bold border border-slate-200 text-slate-600">
              {STOCK_LABEL[product.stockStatus]}
            </span>
          </nav>

<<<<<<< HEAD
          <h1 className="mt-3 font-black text-lg lg:text-2xl leading-8 text-slate-900">
            {product.name}
          </h1>

          {product.rating != null && (
            <div className="flex items-center gap-1.5 mt-2 text-sm">
              <div
                role="img"
                aria-label={`${product.rating} از ۵ ستاره`}
                className="flex"
                aria-hidden="true"
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <Star
                    key={n}
                    size={14}
                    className={
                      n <= Math.round(product.rating!)
                        ? 'fill-amber-400 text-amber-400'
                        : 'fill-slate-200 text-slate-200'
                    }
                  />
                ))}
              </div>
              <span className="font-bold text-slate-900">
                {toPersianDigits(product.rating)}
              </span>
              <span className="text-slate-400">
                ({toPersianDigits(product.reviews)} نظر)
              </span>
=======
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
>>>>>>> b2d024c (feat(web): harden storefront purchase flow)
            </div>
          )}

          {product.description && (
<<<<<<< HEAD
            <RichText
              html={product.description}
              className="mt-4 text-[13px] text-slate-500"
            />
          )}

          {product.variants.length > 1 && (
            <fieldset className="mt-5">
              <legend className="text-sm font-black text-slate-900">
                انتخاب تنوع
              </legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {product.variants.map((variant) => {
                  const sellable =
                    variant.stockStatus === 'IN_STOCK' ||
                    variant.stockStatus === 'LOW_STOCK'
                  const label =
                    variant.title ||
                    variant.attributes
                      .map((value) => value.optionLabel)
                      .join(' / ') ||
                    variant.sku
                  return (
                    <button
                      key={variant.id}
                      type="button"
                      disabled={!sellable}
                      aria-pressed={variant.id === selectedVariant?.id}
                      onClick={() => setSelectedVariantId(variant.id)}
                      className={`rounded-xl border px-3 py-2 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${variant.id === selectedVariant?.id ? 'border-slate-950 bg-slate-950 text-white' : 'border-slate-200 bg-white text-slate-700'} disabled:cursor-not-allowed disabled:opacity-40`}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
            </fieldset>
          )}

          <div className="mt-5 flex items-baseline gap-3">
            <span className="font-black text-[22px] text-slate-900">
              {selectedVariant || product.priceAvailable !== false
                ? formatToman(selectedVariant?.price.amount ?? product.price.amount)
                : 'قیمت در دسترس نیست'}
            </span>
            {product.oldPrice && (
              <>
                <span className="text-sm text-slate-400 line-through">
                  {formatToman(product.oldPrice.amount)}
                </span>
                <span className="px-2 py-1 rounded-full bg-red-500 text-white text-xs font-black">
                  ٪{toPersianDigits(discountPercent)} تخفیف
                </span>
=======
            <p className="mt-4 text-[13px] leading-7 text-slate-500">{product.description}</p>
          )}

          <div className="mt-5 flex items-baseline gap-3">
            <span className="font-black text-[22px] text-slate-900">{formatToman(product.price.amount)}</span>
            {product.oldPrice && (
              <>
                <span className="text-sm text-slate-400 line-through">{formatToman(product.oldPrice.amount)}</span>
                <span className="px-2 py-1 rounded-full bg-red-500 text-white text-xs font-black">٪{toPersianDigits(discountPercent)} تخفیف</span>
>>>>>>> b2d024c (feat(web): harden storefront purchase flow)
              </>
            )}
          </div>

          <div className="mt-6 flex items-center gap-3">
            {inCart ? (
              <div className="flex items-center gap-3 rounded-full border-2 border-[#0F172A] p-1">
                <button
                  type="button"
<<<<<<< HEAD
                  onClick={() =>
                    selectedVariant &&
                    void setQuantity(selectedVariant.id, qty + 1)
                  }
=======
                  onClick={() => setQuantity(product.id, qty + 1)}
>>>>>>> b2d024c (feat(web): harden storefront purchase flow)
                  aria-label="افزایش تعداد"
                  className="w-10 h-10 rounded-full bg-[#0F172A] text-white flex items-center justify-center hover:bg-black disabled:opacity-40"
                  disabled={!available}
                >
                  <Plus size={18} aria-hidden="true" />
                </button>
<<<<<<< HEAD
                <span
                  className="min-w-[24px] text-center font-black"
                  aria-label={toPersianDigits(qty)}
                >
=======
                <span className="min-w-[24px] text-center font-black" aria-label={toPersianDigits(qty)}>
>>>>>>> b2d024c (feat(web): harden storefront purchase flow)
                  {toPersianDigits(qty)}
                </span>
                <button
                  type="button"
<<<<<<< HEAD
                  onClick={() =>
                    selectedVariant &&
                    void setQuantity(selectedVariant.id, qty - 1)
                  }
=======
                  onClick={() => setQuantity(product.id, qty - 1)}
>>>>>>> b2d024c (feat(web): harden storefront purchase flow)
                  aria-label="کاهش تعداد"
                  className="w-10 h-10 rounded-full bg-slate-100 text-slate-900 flex items-center justify-center hover:bg-slate-200"
                >
                  <Minus size={18} aria-hidden="true" />
                </button>
              </div>
            ) : (
              <button
                type="button"
<<<<<<< HEAD
                onClick={() => void handleAdd()}
                disabled={!available || cartBusy}
=======
                onClick={handleAdd}
                disabled={!available}
>>>>>>> b2d024c (feat(web): harden storefront purchase flow)
                className="flex-1 h-12 rounded-full bg-[#FF4D00] text-white font-black hover:bg-[#E54400] disabled:bg-slate-300 disabled:cursor-not-allowed transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4D00] focus-visible:ring-offset-2"
              >
                <span className="inline-flex items-center gap-2">
                  <ShoppingBag size={18} aria-hidden="true" />
<<<<<<< HEAD
                  {cartBusy
                    ? 'در حال آماده‌سازی سبد…'
                    : !selectedVariant
                      ? 'تنوع قابل فروش موجود نیست'
                      : available
                        ? 'افزودن به سبد خرید'
                        : 'ناموجود'}
=======
                  {available ? 'افزودن به سبد خرید' : 'ناموجود'}
>>>>>>> b2d024c (feat(web): harden storefront purchase flow)
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
<<<<<<< HEAD
            <span className="flex items-center gap-1.5">
              <Truck size={15} /> هزینه ارسال پس از ثبت آدرس محاسبه می‌شود
            </span>
            <span className="flex items-center gap-1.5">
              <ShieldCheck size={15} /> ضمانت اصالت کالا
            </span>
=======
            <span className="flex items-center gap-1.5"><Truck size={15} /> {product && Number(product.price.amount) >= FREE_SHIPPING_THRESHOLD_RIALS ? 'ارسال رایگان' : `ارسال ${formatToman(SHIPPING_COST_RIALS)}`}</span>
            <span className="flex items-center gap-1.5"><ShieldCheck size={15} /> ضمانت اصالت کالا</span>
>>>>>>> b2d024c (feat(web): harden storefront purchase flow)
          </div>
        </div>
      </div>
    </div>
  )
}
