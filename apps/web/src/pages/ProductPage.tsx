import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Minus,
  Plus,
  Star,
  Truck,
  ShieldCheck,
  ShoppingBag,
} from 'lucide-react'
import { useCatalogApi } from '../state/catalog-context'
import { useCart } from '../state/cart-context'
import { useAuth } from '../state/auth-context'
import { useToast } from '../components/feedback/toast-context'
import { formatToman, toPersianDigits } from '../lib/format'
import { ROUTES } from '../lib/routes'
import { MediaGallery } from '../components/product/MediaGallery'
import type { CatalogProduct } from '../services/catalog/types'

const STOCK_LABEL: Record<CatalogProduct['stockStatus'], string> = {
  IN_STOCK: 'موجود در انبار',
  LOW_STOCK: 'فقط چند عدد باقی مانده',
  OUT_OF_STOCK: 'ناموجود',
  UNKNOWN: 'موجودی در حال بررسی',
}

export function ProductPage() {
  const api = useCatalogApi()
  const { add, setQuantity, quantityOf, isInCart } = useCart()
  const auth = useAuth()
  const { show } = useToast()
  const navigate = useNavigate()
  const { slug = '' } = useParams<{ slug: string }>()

  const [product, setProduct] = useState<CatalogProduct | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [selectedVariantId, setSelectedVariantId] = useState('')

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
      .then((p) => {
        if (cancelled) return
        setProduct(p)
        const sellable = p.variants.find(
          (variant) =>
            variant.stockStatus === 'IN_STOCK' ||
            variant.stockStatus === 'LOW_STOCK',
        )
        setSelectedVariantId((sellable ?? p.variants[0])?.id ?? '')
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

  if (loading)
    return (
      <div className="max-w-[1280px] mx-auto px-4 py-10 text-slate-500">
        در حال بارگذاری...
      </div>
    )

  if (notFound || !product) {
    return (
      <div className="max-w-[1280px] mx-auto px-4 py-20 text-center">
        <h1 className="font-black text-slate-900 text-xl">محصول یافت نشد</h1>
        <p className="mt-2 text-slate-500 text-sm">
          محصول موردنظر موجود نیست یا آدرس آن تغییر کرده است.
        </p>
        <Link
          to={ROUTES.home}
          className="inline-flex items-center gap-2 mt-6 h-11 px-6 rounded-full bg-[#0F172A] text-white font-bold"
        >
          <ArrowLeft size={16} /> بازگشت به فروشگاه
        </Link>
      </div>
    )
  }

  const item = product
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
    if (auth.state.phase !== 'authenticated') {
      auth.open()
      show('برای افزودن به سبد خرید وارد شوید')
      return
    }
    if (!available || !selectedVariant) return
    try {
      await add(selectedVariant.id)
      show('به سبد خرید افزوده شد')
    } catch {
      show('افزودن به سبد انجام نشد؛ دوباره تلاش کنید')
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
    if (product.description) productData.description = product.description
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
  }

  return (
    <div className="max-w-[1280px] mx-auto px-4 lg:px-6 py-6">
      {structuredData.length > 0 && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
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
              {product.category.name}
            </Link>
            <span className="mx-1">/</span>
          </>
        )}
        <span className="text-slate-600 font-bold">{product.name}</span>
      </nav>

      <div className="grid lg:grid-cols-2 gap-8">
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
            <span className="px-2.5 py-1 rounded-full text-[11px] font-bold border border-slate-200 text-slate-600">
              {STOCK_LABEL[product.stockStatus]}
            </span>
          </nav>

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
            </div>
          )}

          {product.description && (
            <p className="mt-4 text-[13px] leading-7 text-slate-500">
              {product.description}
            </p>
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
              {formatToman(
                selectedVariant?.price.amount ?? product.price.amount,
              )}
            </span>
            {product.oldPrice && (
              <>
                <span className="text-sm text-slate-400 line-through">
                  {formatToman(product.oldPrice.amount)}
                </span>
                <span className="px-2 py-1 rounded-full bg-red-500 text-white text-xs font-black">
                  ٪{toPersianDigits(discountPercent)} تخفیف
                </span>
              </>
            )}
          </div>

          <div className="mt-6 flex items-center gap-3">
            {inCart ? (
              <div className="flex items-center gap-3 rounded-full border-2 border-[#0F172A] p-1">
                <button
                  type="button"
                  onClick={() =>
                    selectedVariant &&
                    void setQuantity(selectedVariant.id, qty + 1)
                  }
                  aria-label="افزایش تعداد"
                  className="w-10 h-10 rounded-full bg-[#0F172A] text-white flex items-center justify-center hover:bg-black disabled:opacity-40"
                  disabled={!available}
                >
                  <Plus size={18} aria-hidden="true" />
                </button>
                <span
                  className="min-w-[24px] text-center font-black"
                  aria-label={toPersianDigits(qty)}
                >
                  {toPersianDigits(qty)}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    selectedVariant &&
                    void setQuantity(selectedVariant.id, qty - 1)
                  }
                  aria-label="کاهش تعداد"
                  className="w-10 h-10 rounded-full bg-slate-100 text-slate-900 flex items-center justify-center hover:bg-slate-200"
                >
                  <Minus size={18} aria-hidden="true" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => void handleAdd()}
                disabled={!available}
                className="flex-1 h-12 rounded-full bg-[#FF4D00] text-white font-black hover:bg-[#E54400] disabled:bg-slate-300 disabled:cursor-not-allowed transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4D00] focus-visible:ring-offset-2"
              >
                <span className="inline-flex items-center gap-2">
                  <ShoppingBag size={18} aria-hidden="true" />
                  {!selectedVariant
                    ? 'تنوع قابل فروش موجود نیست'
                    : available
                      ? 'افزودن به سبد خرید'
                      : 'ناموجود'}
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
            <span className="flex items-center gap-1.5">
              <Truck size={15} /> هزینه ارسال پس از ثبت آدرس محاسبه می‌شود
            </span>
            <span className="flex items-center gap-1.5">
              <ShieldCheck size={15} /> ضمانت اصالت کالا
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
