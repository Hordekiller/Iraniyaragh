import { Link } from 'react-router-dom'
import { Image as ImageIcon, Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react'
import { useCart } from '../state/cart-context'
import { useAuth } from '../state/auth-context'
import { formatToman, toPersianDigits } from '../lib/format'
import { ROUTES } from '../lib/routes'
import { useToast } from '../components/feedback/toast-context'
import { lineTotalRials } from '../services/cart/types'
import { useDocumentMeta } from '../lib/use-document-meta'
import { InlineConfirm } from '../components/feedback/InlineConfirm'
import { LoadFailure } from '../components/feedback/LoadFailure'

export function CartPage() {
  useDocumentMeta({ title: 'سبد خرید', noindex: true })
  const { state, totals, setQuantity, remove, clear, source, error, loading, refresh } = useCart()
  const { state: authState, open } = useAuth()
  const { show } = useToast()
  // A guest draft has no server quote, so it may not state a shipping fee or a
  // final payable amount. Only the server cart quote is authoritative.
  const quoted = source === 'server'

  // A signed-in customer whose server cart has not loaded yet is neither a
  // guest nor an empty-cart customer. Keying this off `source` alone told
  // signed-in visitors to "please sign in" and showed an empty cart on every
  // hard refresh, because the draft source is in force until the server cart
  // arrives.
  const guest = !authState.restored || (source === 'draft' && authState.phase !== 'authenticated')

  if (loading) {
    return (
      <p role="status" className="max-w-[1280px] mx-auto px-4 py-20 text-center text-slate-500">
        در حال بارگذاری سبد خرید...
      </p>
    )
  }

  if (error && state.lines.length === 0) {
    return (
      <div className="max-w-[1280px] mx-auto px-4 py-20">
        <LoadFailure
          onRetry={() => void refresh()}
          title="سبد خرید بارگذاری نشد"
          message={error}
        />
      </div>
    )
  }

  if (state.lines.length === 0) {
    return (
      <div className="max-w-[1280px] mx-auto px-4 py-20 text-center">
        <div className="mx-auto w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
          <ShoppingBag size={28} aria-hidden="true" />
        </div>
        <h1 className="mt-4 font-black text-slate-900 text-xl">سبد خرید شما خالی است</h1>
        <p className="mt-2 text-slate-500 text-sm">برای شروع خرید، از میان محصولات فروشگاه انتخاب کنید.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link
            to={ROUTES.products}
            className="inline-flex items-center gap-2 h-11 px-6 rounded-full bg-[#0F172A] text-white font-bold hover:bg-black transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
          >
            مشاهدهٔ کالاها
          </Link>
          <Link
            to={ROUTES.categories}
            className="inline-flex items-center gap-2 h-11 px-6 rounded-full border border-slate-200 bg-white text-slate-700 font-bold hover:border-slate-900 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4D00] focus-visible:ring-offset-2"
          >
            مرور دسته‌بندی‌ها
          </Link>
          <Link
            to={ROUTES.newest}
            className="inline-flex items-center gap-2 h-11 px-6 rounded-full border border-slate-200 bg-white text-slate-700 font-bold hover:border-slate-900 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4D00] focus-visible:ring-offset-2"
          >
            تازه‌های فروشگاه
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-[1280px] mx-auto px-4 lg:px-6 py-6">
      {error && (
        <div role="alert" className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
          {error}
        </div>
      )}

      {guest && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm font-bold text-amber-800">برای تکمیل سفارش ابتدا وارد حساب خود شوید.</p>
          <button
            type="button"
            onClick={open}
            className="h-9 px-4 rounded-full bg-[#0F172A] text-white text-xs font-black hover:bg-black transition"
          >
            ورود / ثبتنام با موبایل
          </button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h1 className="font-black text-slate-900 text-lg lg:text-xl">
          سبد خرید
          <span className="text-slate-500 text-sm font-bold mr-2">
            ({toPersianDigits(totals.itemCount)} کالا)
          </span>
        </h1>
        <InlineConfirm
          question="همهٔ کالاها حذف شوند؟"
          confirmLabel="بله، حذف کن"
          confirmClassName="h-9 px-3 rounded-full bg-red-600 text-white text-xs font-bold hover:bg-red-700 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
          cancelClassName="h-9 px-3 rounded-full border border-slate-200 text-xs font-bold text-slate-600 hover:text-slate-900 transition"
          onCancel={() => {}}
          onConfirm={() => { clear(); show('سبد خرید خالی شد') }}
        >
          {trigger => (
            <button
              onClick={trigger.onClick}
              type="button"
              className="h-9 px-3 rounded-full border border-red-200 text-xs font-bold text-red-600 hover:border-red-600 hover:bg-red-50 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
            >
              حذف همه
            </button>
          )}
        </InlineConfirm>
      </div>

      {/* Quantity changes are silent to a screen reader without a live region. */}
      <p className="sr-only" role="status" aria-live="polite">
        {toPersianDigits(totals.itemCount)} کالا در سبد خرید
      </p>

      <div className="mt-6 grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-3">
          {state.lines.map(line => {
            const link = line.slug ? ROUTES.product(line.slug) : null
            const image = link ? (
              <Link to={link} className="shrink-0 w-20 h-20 rounded-2xl bg-slate-50 overflow-hidden block">
                {line.image ? (
                  <img src={line.image} alt={line.name} loading="lazy" decoding="async" className="w-full h-full object-cover" />
                ) : (
                  <span className="w-full h-full flex items-center justify-center text-slate-300">
                    <ImageIcon size={24} aria-hidden="true" />
                  </span>
                )}
              </Link>
            ) : (
              <span className="shrink-0 w-20 h-20 rounded-2xl bg-slate-50 overflow-hidden flex items-center justify-center text-slate-300">
                <ImageIcon size={24} aria-hidden="true" />
              </span>
            )
            const title = link ? (
              <Link to={link} className="text-sm font-bold text-slate-900 line-clamp-2 hover:text-[#C2410C]">
                {line.name}
              </Link>
            ) : (
              <p className="text-sm font-bold text-slate-900 line-clamp-2">{line.name}</p>
            )

            return (
              <div key={line.variantId} className="flex items-center gap-4 rounded-[20px] border border-slate-100 bg-white p-4">
                {image}
                <div className="flex-1 min-w-0">
                  {title}
                  <div className="mt-1 text-xs text-slate-500">{line.sku}</div>
                  {line.brand && <div className="mt-0.5 text-[11px] text-slate-500">{line.brand}</div>}
                  <div className="mt-1 text-[13px] font-black text-slate-900">
                    {formatToman(lineTotalRials(line))}
                  </div>
                  <div className="text-[11px] text-slate-500">واحد: {formatToman(Number(line.unitPrice.amount))}</div>
                </div>

                <div className="flex flex-col items-end gap-2">
                  {/* 44px touch targets (WCAG 2.2 target-size): the visual dot is
                      smaller but the button itself keeps the full hit area. */}
                  <div className="flex items-center rounded-full border border-slate-200 p-0.5">
                    <button
                      type="button"
                      onClick={() => setQuantity(line.variantId, line.quantity + 1)}
                      aria-label={`افزایش تعداد ${line.name}`}
                      className="w-11 h-11 rounded-full bg-slate-900 text-white flex items-center justify-center hover:bg-black transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4D00] focus-visible:ring-offset-1"
                    >
                      <Plus size={16} aria-hidden="true" />
                    </button>
                    <span className="min-w-[28px] text-center text-sm font-black" aria-hidden="true">
                      {toPersianDigits(line.quantity)}
                    </span>
                    <button
                      type="button"
                      onClick={() => setQuantity(line.variantId, line.quantity - 1)}
                      aria-label={`کاهش تعداد ${line.name}`}
                      className="w-11 h-11 rounded-full bg-slate-100 text-slate-900 flex items-center justify-center hover:bg-slate-200 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4D00] focus-visible:ring-offset-1"
                    >
                      <Minus size={16} aria-hidden="true" />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(line.variantId)}
                    aria-label={`حذف ${line.name}`}
                    className="h-11 px-3 text-xs font-bold text-red-700 hover:text-red-800 inline-flex items-center gap-1 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                  >
                    <Trash2 size={14} aria-hidden="true" /> حذف
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        <aside className="lg:col-span-1">
          <div className="rounded-[24px] border border-slate-100 bg-white p-5 lg:sticky lg:top-24">
            <h2 className="font-black text-slate-900">خلاصه سفارش</h2>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between text-slate-600">
                <dt>جمع کل کالاها</dt>
                <dd className="font-bold">{formatToman(totals.subtotalRials)}</dd>
              </div>
              <div className="flex justify-between text-slate-600">
                <dt>هزینه ارسال</dt>
                <dd className="font-bold">
                  {quoted ? (totals.shippingRials === 0 ? 'رایگان' : formatToman(totals.shippingRials)) : 'در تسویه‌حساب محاسبه می‌شود'}
                </dd>
              </div>
              <div className="h-px bg-slate-100 my-3" />
              <div className="flex justify-between items-center">
                <dt className="font-black text-slate-900">{quoted ? 'مبلغ قابل پرداخت' : 'جمع کالاها'}</dt>
                <dd className="font-black text-[18px] text-[#C2410C]">{formatToman(totals.subtotalRials)}</dd>
              </div>
            </dl>

            <Link
              to={ROUTES.checkout}
              className="mt-5 block w-full h-12 rounded-full bg-[#C2410C] text-white font-black flex items-center justify-center hover:bg-[#A83509] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C2410C] focus-visible:ring-offset-2"
            >
              ادامه فرایند خرید
            </Link>
            <Link to={ROUTES.home} className="mt-3 block w-full h-11 rounded-full border-2 border-slate-900 text-slate-900 font-black flex items-center justify-center hover:bg-slate-900 hover:text-white transition">
              ادامه خرید
            </Link>
          </div>
        </aside>
      </div>
    </div>
  )
}