import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Minus, Plus, Star, ShoppingBag } from 'lucide-react'
import { useCatalogApi } from '../state/catalog-context'
import { useCart } from '../state/cart-context'
import { useToast } from '../components/feedback/toast-context'
import { formatToman, toPersianDigits } from '../lib/format'
import { ROUTES } from '../lib/routes'
import { categoryTrail, descriptionLead, variantPriceRangeLabel } from '../lib/product'
import { useDocumentMeta } from '../lib/use-document-meta'
import { isNotFound } from '../lib/load-error'
import { LoadFailure } from '../components/feedback/LoadFailure'
import { MediaGallery } from '../components/product/MediaGallery'
import { ProductBreadcrumb } from '../components/product/ProductBreadcrumb'
import { ProductDescription } from '../components/product/ProductDescription'
import { ProductSpecifications } from '../components/product/ProductSpecifications'
import { ProductVariantsTable } from '../components/product/ProductVariantsTable'
import { DeliveryNotice } from '../components/product/DeliveryNotice'
import { ProductGrid } from '../components/product/ProductGrid'
import type { CatalogCategory, CatalogProduct, StorefrontVariant } from '../services/catalog/types'
import type { CartLine } from '../services/cart/types'

const STOCK_LABEL: Record<CatalogProduct['stockStatus'], string> = {
  IN_STOCK: 'موجود در انبار',
  LOW_STOCK: 'فقط چند عدد باقی مانده',
  OUT_OF_STOCK: 'ناموجود',
  UNKNOWN: 'موجودی در حال بررسی',
}

const VARIANT_STOCK_LABEL: Record<'available' | 'out', string> = {
  available: 'موجود',
  out: 'ناموجود',
}

const RELATED_LIMIT = 4

/**
 * Serialise JSON-LD for an inline `<script>` block.
 *
 * The payload embeds catalog-controlled strings (product name, description,
 * media URLs). HTML parsing ends a `<script>` element at the first `</script`,
 * so those characters are escaped; the JSON is still valid and `JSON.parse`
 * returns the original values.
 */
function jsonLdPayload(value: unknown): string {
  const escape = (ch: string) => '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0')
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, escape)
}

export function ProductPage() {
  const api = useCatalogApi()
  const { add, setQuantity, quantityOf, isInCart } = useCart()
  const { show } = useToast()
  const navigate = useNavigate()
  const { slug = '' } = useParams<{ slug: string }>()

  const [product, setProduct] = useState<CatalogProduct | null>(null)
  const [categories, setCategories] = useState<CatalogCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [failed, setFailed] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // Keyed by category slug so a product without a category simply renders no
  // related list instead of clearing state inside the effect.
  const [relatedFor, setRelatedFor] = useState<{ slug: string; items: CatalogProduct[] } | null>(null)

  const [resolvedSlug, setResolvedSlug] = useState(slug)
  const [reloadToken, setReloadToken] = useState(0)
  const retry = useCallback(() => setReloadToken(current => current + 1), [])
  if (resolvedSlug !== slug) {
    setResolvedSlug(slug)
    setProduct(null)
    setLoading(true)
    setNotFound(false)
    setFailed(false)
  }

  // Reset the variant selection whenever a different product loads.
  const [resolvedProductId, setResolvedProductId] = useState<string | null>(null)
  if (resolvedProductId !== (product?.id ?? null)) {
    setResolvedProductId(product?.id ?? null)
    setSelectedId(product?.defaultVariantId ?? null)
  }

  useEffect(() => {
    let cancelled = false
    api
      .getProductBySlug(slug)
      .then(p => {
        if (cancelled) return
        setProduct(p)
        setLoading(false)
        setNotFound(false)
        setFailed(false)
      })
      .catch((error: unknown) => {
        if (cancelled) return
        // A failed request is not proof the product is gone. Only the API's own
        // NOT_FOUND may render "this product does not exist".
        setProduct(null)
        if (isNotFound(error)) {
          setNotFound(true)
          setFailed(false)
        } else {
          setNotFound(false)
          setFailed(true)
        }
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [api, slug, reloadToken])

  // The category list is only needed for the breadcrumb trail; a failure must
  // never break the product page, so it degrades to the product's own category.
  useEffect(() => {
    let cancelled = false
    api
      .listCategories()
      .then(list => {
        if (!cancelled) setCategories(list)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [api])

  // Sibling products from the same real category, loaded after the product so
  // the detail surface is never blocked by the recommendation request.
  useEffect(() => {
    const categorySlug = product?.category?.slug
    if (!categorySlug) return undefined
    let cancelled = false
    api
      .listProducts({ categorySlug })
      .then(result => {
        if (cancelled) return
        setRelatedFor({
          slug: categorySlug,
          items: result.items.filter(item => item.id !== product?.id).slice(0, RELATED_LIMIT),
        })
      })
      .catch(() => {
        if (!cancelled) setRelatedFor({ slug: categorySlug, items: [] })
      })
    return () => {
      cancelled = true
    }
  }, [api, product])

  const related = useMemo(
    () => (relatedFor && relatedFor.slug === product?.category?.slug ? relatedFor.items : []),
    [relatedFor, product?.category?.slug],
  )
  const variants = useMemo(() => product?.variants ?? [], [product?.variants])
  const selected: StorefrontVariant | null = variants.find(v => v.id === selectedId) ?? variants[0] ?? null
  const lead = useMemo(() => descriptionLead(product?.description ?? null), [product?.description])
  const priceRange = useMemo(() => variantPriceRangeLabel(variants), [variants])

  useDocumentMeta({
    title: product?.name ?? 'محصول',
    description: lead ?? product?.name ?? null,
    canonicalPath: product ? ROUTES.product(product.slug) : undefined,
    noindex: !product,
  })

  if (loading) return <div className="max-w-[1280px] mx-auto px-4 py-10 text-slate-500">در حال بارگذاری...</div>

  if (failed) {
    return (
      <div className="max-w-[1280px] mx-auto px-4 lg:px-6">
        <LoadFailure onRetry={retry} title="محصول بارگذاری نشد" />
      </div>
    )
  }

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
  const variantAvailable = Boolean(selected?.available)
  const inCart = selected ? isInCart(selected.id) : false
  const qty = selected ? quantityOf(selected.id) : 0
  const canAdd = Boolean(selected && variantAvailable)
  const unitPrice = selected?.salePrice ?? product.price
  const discountPercent =
    product.oldPrice && Number(product.oldPrice.amount) > 0
      ? Math.round((1 - Number(unitPrice.amount) / Number(product.oldPrice.amount)) * 100)
      : 0

  function handleAdd() {
    if (!selected || !variantAvailable) return
    const line: CartLine = {
      variantId: selected.id,
      productId: item.id,
      slug: item.slug,
      name: item.name,
      brand: item.brand,
      image: item.image,
      sku: selected.sku,
      unitPrice: selected.salePrice,
      oldPrice: item.oldPrice,
      quantity: 1,
      available: null,
    }
    add(line)
    show('به سبد خرید افزوده شد')
  }

  // Structured data uses only values that actually exist in the API response;
  // counts, ratings and dates that are not returned are never invented (spec §7).
  const structuredData: Record<string, unknown>[] = []
  if (product.media.length > 0) {
    const imageUrls = product.media
      .filter(media => media.kind === 'IMAGE')
      .flatMap(media => media.sources.map(source => source.url))
    const productData: Record<string, unknown> = {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: product.name,
      url: ROUTES.product(product.slug),
      image: imageUrls.length > 0 ? imageUrls : undefined,
    }
    if (product.description) productData.description = product.description
    if (product.brand) productData.brand = { '@type': 'Brand', name: product.brand }
    if (selected) {
      productData.sku = selected.sku
      productData.offers = {
        '@type': 'Offer',
        price: selected.salePrice.amount,
        priceCurrency: selected.salePrice.currency,
        availability: selected.available
          ? 'https://schema.org/InStock'
          : 'https://schema.org/OutOfStock',
      }
    }
    structuredData.push(productData)
  }
  for (const media of product.media) {
    if (media.kind !== 'VIDEO') continue
    const videoData: Record<string, unknown> = {
      '@context': 'https://schema.org',
      '@type': 'VideoObject',
      name: `${product.name} — ویدیو`,
      description: media.description,
      thumbnailUrl: media.poster.sources.map(source => source.url),
      contentUrl: media.sources[0]?.url,
    }
    if (media.durationMs > 0) videoData.duration = `PT${Math.round(media.durationMs / 1000)}S`
    structuredData.push(videoData)
  }

  return (
    <div className="max-w-[1280px] mx-auto px-4 lg:px-6 py-6">
      {structuredData.length > 0 && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdPayload(structuredData) }} />
      )}
      <ProductBreadcrumb trail={categoryTrail(product, categories)} productName={product.name} />

      <div className="grid lg:grid-cols-2 gap-8">
        <MediaGallery
          media={product.media}
          productName={product.name}
          badge={product.badge}
          fallbackImage={product.image}
        />

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

          {lead && (
            <p className="mt-4 text-[13px] leading-7 text-slate-500">{lead}</p>
          )}

          {variants.length > 0 && (
            <div className="mt-5">
              <h2 className="text-xs font-black text-slate-700">انتخاب تنوع</h2>
              <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="انتخاب تنوع محصول">
                {variants.map(variant => {
                  const selectedThis = selected?.id === variant.id
                  return (
                    <button
                      key={variant.id}
                      type="button"
                      role="radio"
                      aria-checked={selectedThis}
                      onClick={() => setSelectedId(variant.id)}
                      className={[
                        'rounded-full border px-4 py-2 text-sm font-bold transition text-right flex items-center gap-2',
                        selectedThis ? 'border-[#0F172A] bg-[#0F172A] text-white' : 'border-slate-200 bg-white text-slate-900 hover:border-slate-400',
                        variant.available ? '' : 'opacity-60',
                      ].join(' ')}
                    >
                      <span>{variant.title ?? 'استاندارد'}</span>
                      <span className={selectedThis ? 'text-slate-300' : 'text-slate-400'}>{variant.sku}</span>
                      <span
                        className={[
                          'px-2 py-0.5 rounded-full text-[10px] font-black',
                          variant.available ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500',
                        ].join(' ')}
                      >
                        {VARIANT_STOCK_LABEL[variant.available ? 'available' : 'out']}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <div className="mt-5 flex flex-wrap items-baseline gap-3">
            <span className="font-black text-[22px] text-slate-900">{formatToman(unitPrice.amount)}</span>
            {priceRange && (
              <span className="text-xs text-slate-400">{priceRange}</span>
            )}
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
                  onClick={() => selected && setQuantity(selected.id, qty + 1)}
                  aria-label="افزایش تعداد"
                  className="w-10 h-10 rounded-full bg-[#0F172A] text-white flex items-center justify-center hover:bg-black disabled:opacity-40"
                  disabled={!canAdd}
                >
                  <Plus size={18} aria-hidden="true" />
                </button>
                <span className="min-w-[24px] text-center font-black" aria-label={toPersianDigits(qty)}>
                  {toPersianDigits(qty)}
                </span>
                <button
                  type="button"
                  onClick={() => selected && setQuantity(selected.id, qty - 1)}
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
                disabled={!canAdd}
                className="flex-1 h-12 rounded-full bg-[#FF4D00] text-white font-black hover:bg-[#E54400] disabled:bg-slate-300 disabled:cursor-not-allowed transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4D00] focus-visible:ring-offset-2"
              >
                <span className="inline-flex items-center gap-2">
                  <ShoppingBag size={18} aria-hidden="true" />
                  {selected ? (variantAvailable ? 'افزودن به سبد خرید' : 'ناموجود') : 'انتخاب تنوع الزامی است'}
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

          <DeliveryNotice />
        </div>
      </div>

      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        <ProductSpecifications
          brand={product.brand}
          category={product.category}
          variant={selected}
          variantCount={variants.length}
        />
        {variants.length > 1 && (
          <ProductVariantsTable
            variants={variants}
            selectedId={selected?.id ?? null}
            onSelect={setSelectedId}
            stockLabel={VARIANT_STOCK_LABEL}
          />
        )}
      </div>

      <div className="mt-4">
        <ProductDescription description={product.description} />
      </div>

      {related.length > 0 && (
        <section aria-labelledby="related-products" className="mt-8">
          <div className="flex items-center justify-between gap-3">
            <h2 id="related-products" className="font-black text-slate-900 text-base">
              کالاهای همین دسته
            </h2>
            {product.category && (
              <Link
                to={ROUTES.category(product.category.slug)}
                className="text-xs font-bold text-slate-500 hover:text-[#FF4D00]"
              >
                مشاهده همه
              </Link>
            )}
          </div>
          <div className="mt-4">
            <ProductGrid products={related} />
          </div>
        </section>
      )}
    </div>
  )
}
