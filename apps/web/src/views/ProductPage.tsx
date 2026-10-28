'use client'

import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Minus,
  Plus,
  Star,
  Truck,
  ShoppingBag,
} from 'lucide-react'
import { useCatalogApi } from '../state/catalog-context'
import { useCart } from '../state/cart-context'
import { useToast } from '../components/feedback/toast-context'
import { formatToman, toPersianDigits } from '../lib/format'
import { ROUTES } from '../lib/routes'
import { MediaGallery } from '../components/product/MediaGallery'
import { RichText } from '../components/product/RichText'
import { serializeJsonLd } from '../lib/json-ld'
import { richTextToPlainText } from '../lib/rich-text'
import type { CatalogProduct } from '../services/catalog/types'
import { commerceErrorMessage } from '../services/commerce/errors'

const STOCK_LABEL: Record<CatalogProduct['stockStatus'], string> = {
  IN_STOCK: 'موجود در انبار',
  LOW_STOCK: 'فقط چند عدد باقی مانده',
  OUT_OF_STOCK: 'ناموجود',
  UNKNOWN: 'موجودی در حال بررسی',
}

export function ProductPage({ initialProduct, serverStructuredData = false }: { initialProduct?: CatalogProduct; serverStructuredData?: boolean } = {}) {
  const api = useCatalogApi()
  const { state: cartState, add, setQuantity, quantityOf, isInCart } = useCart()
  const { show } = useToast()
  const navigate = useNavigate()
  const { slug = '' } = useParams<{ slug: string }>()

  const [product, setProduct] = useState<CatalogProduct | null>(initialProduct ?? null)
  const [loading, setLoading] = useState(!initialProduct)
  const [notFound, setNotFound] = useState(false)
  const [selectedVariantId, setSelectedVariantId] = useState((initialProduct?.variants.find(variant => variant.stockStatus === 'IN_STOCK' || variant.stockStatus === 'LOW_STOCK') ?? initialProduct?.variants[0])?.id ?? '')

  const [resolvedSlug, setResolvedSlug] = useState(slug)
  if (resolvedSlug !== slug) {
    setResolvedSlug(slug)
    setProduct(null)
    setLoading(true)
    setNotFound(false)
  }

  useEffect(() => {
    if (initialProduct?.slug === slug) return
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
  }, [api, slug, initialProduct])

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

  // Illustrations that already live inside the description are not repeated
  // in the gallery, so the shopper never sees the same picture twice.
  const descriptionMediaIds = new Set(
    [...(product.description ?? '').matchAll(/<img\b[^>]*\bdata-media-id="([^"]+)"/giu)].map(
      match => match[1],
    ),
  )

  // Structured data uses only values that actually exist in the API response;
  // counts and dates that are not returned are never invented (spec §7).
  const structuredData: Record<string, unknown>[] = []
  if (!serverStructuredData && product.media.length > 0) {
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
  for (const media of serverStructuredData ? [] : product.media) {
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
    <div className="max-w-[1280px] mx-auto px-4 pt-5 pb-[calc(11rem+env(safe-area-inset-bottom))] lg:px-6 lg:py-8">
      {!serverStructuredData && structuredData.length > 0 && (
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
              {product.category.name}
            </Link>
            <span className="mx-1">/</span>
          </>
        )}
        <span className="inline-block max-w-[16rem] truncate align-bottom font-bold text-slate-600 sm:max-w-[32rem]">
          {product.name}
        </span>
      </nav>

      <h1 className="mb-5 text-lg font-black leading-8 text-slate-900 sm:text-xl lg:text-2xl">
        {product.name}
      </h1>

      <div className="grid min-w-0 gap-5 lg:grid-cols-2 lg:gap-8">
        <MediaGallery
          media={product.media.filter(
            (media) =>
              media.kind !== 'IMAGE' ||
              media.role === 'PRIMARY' ||
              !descriptionMediaIds.has(media.id),
          )}
          productName={product.name}
          badge={product.badge}
          fallbackImage={product.image}
        />

        <div className="min-w-0 lg:sticky lg:top-24 lg:self-start">
          <nav className="flex flex-wrap items-center gap-2">
            {product.brand && (
              <span className="text-sm font-black text-slate-500">
                {product.brand}
              </span>
            )}
            <span className="px-2.5 py-1 rounded-full text-[11px] font-bold border border-slate-200 text-slate-600">
              {STOCK_LABEL[product.stockStatus]}
            </span>
          </nav>

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

          <section
            id="product-purchase"
            aria-label="قیمت و خرید محصول"
            className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-4px_20px_rgb(15_23_42_/_0.08)] lg:static lg:mt-5 lg:rounded-2xl lg:border lg:p-5 lg:shadow-none"
          >
            <div
              className="flex flex-wrap items-baseline gap-x-3 gap-y-1"
              aria-live="polite"
            >
              <span className="text-xs text-slate-500">قیمت هر عدد</span>
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
                </>
              )}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2 sm:gap-3">
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
                  disabled={!available || cartBusy}
                  className="flex-1 h-12 rounded-full bg-[#FF4D00] text-white font-black hover:bg-[#E54400] disabled:bg-slate-300 disabled:cursor-not-allowed transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4D00] focus-visible:ring-offset-2"
                >
                  <span className="inline-flex items-center gap-2">
                    <ShoppingBag size={18} aria-hidden="true" />
                    {cartBusy
                      ? 'در حال آماده‌سازی سبد…'
                      : !selectedVariant
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
                className="h-12 shrink-0 px-4 sm:px-6 rounded-full border-2 border-slate-900 font-black hover:bg-slate-900 hover:text-white transition"
              >
                مشاهده سبد
              </button>
            </div>
          </section>

          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl bg-slate-50 p-3 text-xs leading-6 text-slate-600">
            <span className="flex items-center gap-1.5">
              <Truck size={15} /> هزینه ارسال پس از ثبت آدرس محاسبه می‌شود
            </span>
          </div>
        </div>
      </div>

      <div className="mt-8 space-y-8 lg:mt-12">
        {selectedVariant && selectedVariant.attributes.length > 0 && (
          <section aria-label="ویژگی‌های تنوع انتخاب‌شده">
            <h2 className="text-sm font-black text-slate-900">مشخصات تنوع</h2>
            <dl
              data-testid="product-attributes"
              className="mt-3 grid divide-y divide-slate-100 rounded-xl border border-slate-200 px-3 lg:grid-cols-2 lg:gap-x-8"
            >
              {selectedVariant.attributes.map(value => (
                <div
                  key={value.attributeCode}
                  className="grid min-w-0 grid-cols-2 gap-3 py-3 text-sm"
                >
                  <dt className="text-slate-600">{value.attributeName}</dt>
                  <dd className="font-bold text-slate-900">
                    {value.optionLabel}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        {product.description && (
          <section
            aria-labelledby="product-description-heading"
            className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 lg:p-8"
          >
            <h2
              id="product-description-heading"
              className="mb-4 text-lg font-black text-slate-900"
            >
              توضیحات و راهنمای محصول
            </h2>
            <RichText
              html={product.description}
              className="text-sm leading-8 text-slate-700 sm:text-base"
            />
          </section>
        )}
      </div>
    </div>
  )
}
