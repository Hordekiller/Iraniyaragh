import { Link } from 'react-router-dom'
<<<<<<< HEAD
import {
  Info,
  LogIn,
  Minus,
  Plus,
  RefreshCw,
  ShoppingBag,
  Trash2,
  TriangleAlert,
} from 'lucide-react'
import { useCart } from '../state/cart-context'
import { useAuth } from '../state/auth-context'
import { formatToman, toPersianDigits } from '../lib/format'
import { ROUTES } from '../lib/routes'
import { commerceErrorMessage } from '../services/commerce/errors'

export function CartPage() {
  const { state, setQuantity, remove, clear, reload } = useCart()
  const auth = useAuth()
  const lines = state.cart.lines
  const itemCount = lines.reduce((sum, line) => sum + line.quantity, 0)

  if (state.phase === 'idle' || state.phase === 'loading') {
    return (
      <div
        className="mx-auto max-w-[1280px] px-4 py-20 text-center text-slate-500"
        role="status"
        aria-live="polite"
      >
        در حال دریافت سبد خرید…
=======
import { Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react'
import { useCart } from '../state/cart-context'
import { formatToman, toPersianDigits } from '../lib/format'
import { ROUTES } from '../lib/routes'
import { lineTotalRials } from '../services/cart/types'
import { useToast } from '../components/feedback/toast-context'
import { FREE_SHIPPING_THRESHOLD_RIALS, SHIPPING_COST_RIALS } from '../lib/site-config'

export function CartPage() {
  const { state, setQuantity, remove, clear } = useCart()
  const { show } = useToast()

  const subtotalR = state.lines.reduce((sum, line) => sum + lineTotalRials(line), 0)
  const shippingR = subtotalR >= FREE_SHIPPING_THRESHOLD_RIALS || state.lines.length === 0 ? 0 : SHIPPING_COST_RIALS
  const totalR = subtotalR + shippingR
  const itemCount = state.lines.reduce((sum, line) => sum + line.quantity, 0)

  if (state.lines.length === 0) {
    return (
      <div className="max-w-[1280px] mx-auto px-4 py-20 text-center">
        <div className="mx-auto w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
          <ShoppingBag size={28} aria-hidden="true" />
        </div>
        <h1 className="mt-4 font-black text-slate-900 text-xl">سبد خرید شما خالی است</h1>
        <p className="mt-2 text-slate-500 text-sm">برای شروع خرید، از میان محصولات فروشگاه انتخاب کنید.</p>
        <Link to={ROUTES.home} className="inline-flex items-center gap-2 mt-6 h-11 px-6 rounded-full bg-[#0F172A] text-white font-bold hover:bg-black transition">
          بازگشت به فروشگاه
        </Link>
>>>>>>> b2d024c (feat(web): harden storefront purchase flow)
      </div>
    )
  }

<<<<<<< HEAD
  if (state.phase === 'merging' && lines.length === 0) {
    return (
      <CommerceNotice
        title="در حال اتصال سبد به حساب شما"
        description="پس از ورود با موبایل، کالاهای سبد مهمان با سبد حساب شما ادغام می‌شوند."
        action={
          <span
            className={`${primaryButton} cursor-wait opacity-70`}
            role="status"
            aria-live="polite"
          >
            <RefreshCw
              size={16}
              className="animate-spin motion-reduce:animate-none"
            />{' '}
            در حال ادغام…
          </span>
        }
      />
    )
  }

  if (state.phase === 'error' && lines.length === 0) {
    return (
      <CommerceNotice
        title="سبد خرید دریافت نشد"
        description={commerceErrorMessage(state.error)}
        action={
          <button
            type="button"
            onClick={() => void reload()}
            className={primaryButton}
          >
            <RefreshCw size={16} /> تلاش دوباره
          </button>
        }
      />
    )
  }

  if (lines.length === 0) {
    return (
      <CommerceNotice
        title="سبد خرید شما خالی است"
        description="برای شروع خرید، یکی از تنوع‌های موجود را از صفحه محصول انتخاب کنید."
        action={
          <Link to={ROUTES.home} className={primaryButton}>
            مشاهده محصولات
          </Link>
        }
      />
    )
  }

  return (
    <div className="mx-auto max-w-[1280px] px-4 py-6 lg:px-6 lg:py-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold text-amber-700">
            سبد قیمت‌گذاری‌شده توسط فروشگاه
          </p>
          <h1 className="mt-1 text-xl font-black text-slate-950 lg:text-2xl">
            سبد خرید
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {toPersianDigits(itemCount)} کالا در {toPersianDigits(lines.length)}{' '}
            ردیف
          </p>
        </div>
        <button
          type="button"
          onClick={() => void clear()}
          disabled={state.phase === 'merging'}
          className="text-sm font-bold text-red-700 hover:text-red-800 disabled:cursor-not-allowed disabled:opacity-50"
=======
  return (
    <div className="max-w-[1280px] mx-auto px-4 lg:px-6 py-6">
      <div className="flex items-center justify-between">
        <h1 className="font-black text-slate-900 text-lg lg:text-xl">
          سبد خرید
          <span className="text-slate-400 text-sm font-bold mr-2">({toPersianDigits(itemCount)} کالا)</span>
        </h1>
        <button
          type="button"
          onClick={() => { clear(); show('سبد خرید خالی شد') }}
          className="text-xs font-bold text-red-600 hover:text-red-700"
>>>>>>> b2d024c (feat(web): harden storefront purchase flow)
        >
          حذف همه
        </button>
      </div>

<<<<<<< HEAD
      {state.owner === 'guest' && auth.state.phase !== 'authenticated' && (
        <div className="mt-5 flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-7 text-amber-950">
          <Info
            className="mt-1 shrink-0 text-amber-700"
            size={18}
            aria-hidden="true"
          />
          <p>
            این سبد به‌صورت امن روی سرور و برای همین مرورگر نگهداری می‌شود. فقط
            هنگام ادامه خرید، ورود سریع با شماره موبایل لازم است و کالاها خودکار
            به حساب شما منتقل می‌شوند.
          </p>
        </div>
      )}

      {state.phase === 'merging' && (
        <div
          className="mt-5 flex items-center gap-3 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm font-bold text-sky-900"
          role="status"
          aria-live="polite"
        >
          <RefreshCw
            size={17}
            className="shrink-0 animate-spin motion-reduce:animate-none"
            aria-hidden="true"
          />
          در حال ادغام امن سبد مهمان با حساب شما…
        </div>
      )}

      {state.mergeWarnings.length > 0 && (
        <div
          className="mt-5 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"
          role="status"
          aria-live="polite"
        >
          <p className="flex items-center gap-2 font-black">
            <TriangleAlert size={17} aria-hidden="true" />
            سبدها ادغام شدند؛ چند مورد نیاز به توجه دارد
          </p>
          <ul className="mt-2 list-disc space-y-1 pr-5 leading-7">
            {state.mergeWarnings.map((warning) => (
              <li key={`${warning.variantId}:${warning.code}`}>
                {warning.code === 'QUANTITY_CAPPED'
                  ? 'تعداد یکی از کالاهای مشترک به سقف ۹۹ عدد رسید.'
                  : 'به‌دلیل سقف ۱۰۰ ردیف، یکی از کالاهای سبد مهمان اضافه نشد.'}
              </li>
            ))}
          </ul>
        </div>
      )}

      {Boolean(state.error) && (
        <div
          role="alert"
          aria-live="assertive"
          className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-800"
        >
          <span>{commerceErrorMessage(state.error)}</span>
          <button
            type="button"
            onClick={() => void reload()}
            className="inline-flex items-center gap-2 underline"
          >
            <RefreshCw size={15} />
            {auth.state.phase === 'authenticated' && state.owner === 'guest'
              ? 'تلاش دوباره برای ادغام'
              : 'به‌روزرسانی سبد'}
          </button>
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <ul className="space-y-3" aria-label="اقلام سبد خرید">
          {lines.map((line) => {
            const pending = state.pendingVariantIds.includes(line.variantId)
            return (
              <li
                key={line.variantId}
                className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
              >
                <div className="flex gap-4">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-amber-400">
                    <ShoppingBag aria-hidden="true" size={24} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="font-black leading-6 text-slate-950">
                      {line.title}
                    </h2>
                    <p className="mt-1 text-xs text-slate-500">
                      کد کالا: <span dir="ltr">{line.sku}</span>
                    </p>
                    <p className="mt-2 text-sm font-black text-amber-700">
                      {formatToman(line.lineTotal.amount)}
                    </p>
                    <p className="text-xs text-slate-500">
                      قیمت واحد: {formatToman(line.unitPrice.amount)}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={pending || state.phase === 'merging'}
                    onClick={() => void remove(line.variantId)}
                    aria-label={`حذف ${line.title}`}
                    className="h-9 w-9 shrink-0 rounded-full text-red-700 hover:bg-red-50 disabled:opacity-50"
                  >
                    <Trash2 className="mx-auto" size={17} aria-hidden="true" />
                  </button>
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
                  <span className="text-xs text-slate-500">
                    موجودی قابل سفارش: {toPersianDigits(line.available)}
                  </span>
                  <div
                    className="flex items-center rounded-full border border-slate-300 p-1"
                    aria-label={`تعداد ${line.title}`}
                  >
                    <button
                      type="button"
                      disabled={
                        pending ||
                        state.phase === 'merging' ||
                        line.quantity >= 99
                      }
                      onClick={() =>
                        void setQuantity(line.variantId, line.quantity + 1)
                      }
                      aria-label={`افزایش تعداد ${line.title}`}
                      className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-950 text-white disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Plus size={15} />
                    </button>
                    <span
                      className="min-w-10 text-center font-black"
                      aria-live="polite"
                    >
                      {toPersianDigits(line.quantity)}
                    </span>
                    <button
                      type="button"
                      disabled={pending || state.phase === 'merging'}
                      onClick={() =>
                        void setQuantity(line.variantId, line.quantity - 1)
                      }
                      aria-label={`کاهش تعداد ${line.title}`}
                      className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-950 disabled:opacity-40"
                    >
                      <Minus size={15} />
                    </button>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>

        <aside>
          <div className="rounded-[24px] bg-slate-950 p-5 text-white shadow-xl lg:sticky lg:top-28">
            <p className="text-xs font-bold text-amber-400">خلاصه سبد</p>
            <h2 className="mt-1 text-lg font-black">مبلغ فعلی کالاها</h2>
            <dl className="mt-5 space-y-3 text-sm">
              <div className="flex justify-between gap-4 text-slate-300">
                <dt>جمع کالاها</dt>
                <dd className="font-black text-white">
                  {formatToman(state.cart.quote.subtotal.amount)}
                </dd>
              </div>
              <div className="flex justify-between gap-4 text-slate-300">
                <dt>ارسال</dt>
                <dd>پس از ثبت آدرس</dd>
              </div>
            </dl>
            <p className="mt-4 border-t border-white/10 pt-4 text-xs leading-6 text-slate-400">
              قیمت، موجودی و هزینه ارسال در مرحله بعد دوباره توسط سرور بررسی
              می‌شود.
            </p>
            {state.owner === 'customer' ? (
              <Link
                to={ROUTES.checkout}
                className="mt-5 flex h-12 w-full items-center justify-center rounded-xl bg-gradient-to-l from-amber-400 to-orange-500 font-black text-slate-950 hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
              >
                ادامه فرایند خرید
              </Link>
            ) : auth.state.phase === 'authenticated' ? (
              <button
                type="button"
                onClick={() => void reload()}
                disabled={state.phase === 'merging'}
                className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-l from-amber-400 to-orange-500 font-black text-slate-950 hover:brightness-105 disabled:cursor-wait disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
              >
                <RefreshCw size={17} aria-hidden="true" />
                تلاش دوباره برای اتصال سبد
              </button>
            ) : (
              <button
                type="button"
                onClick={auth.open}
                className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-l from-amber-400 to-orange-500 font-black text-slate-950 hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
              >
                <LogIn size={17} aria-hidden="true" />
                ورود با موبایل و ادامه خرید
              </button>
            )}
=======
      <div className="mt-6 grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-3">
          {state.lines.map(line => (
            <div key={line.productId} className="flex items-center gap-4 rounded-[20px] border border-slate-100 bg-white p-4">
              <Link to={ROUTES.product(line.slug)} className="shrink-0 w-20 h-20 rounded-2xl bg-slate-50 overflow-hidden">
                <img src={line.image} alt={line.name} className="w-full h-full object-cover" />
              </Link>
              <div className="flex-1 min-w-0">
                <Link to={ROUTES.product(line.slug)} className="text-sm font-bold text-slate-900 line-clamp-2 hover:text-[#FF4D00]">
                  {line.name}
                </Link>
                <div className="mt-1 text-xs text-slate-400">{line.brand}</div>
                <div className="mt-1 text-[13px] font-black text-slate-900">
                  {formatToman(lineTotalRials(line))}
                </div>
                <div className="text-[11px] text-slate-400">واحد: {formatToman(Number(line.unitPrice.amount))}</div>
              </div>

              <div className="flex flex-col items-end gap-2">
                <div className="flex items-center gap-2 rounded-full border border-slate-200 p-0.5">
                  <button type="button" onClick={() => setQuantity(line.productId, line.quantity + 1)} aria-label={`افزایش تعداد ${line.name}`} className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center hover:bg-black">
                    <Plus size={14} aria-hidden="true" />
                  </button>
                  <span className="min-w-[20px] text-center text-sm font-black">{toPersianDigits(line.quantity)}</span>
                  <button type="button" onClick={() => setQuantity(line.productId, line.quantity - 1)} aria-label={`کاهش تعداد ${line.name}`} className="w-8 h-8 rounded-full bg-slate-100 text-slate-900 flex items-center justify-center hover:bg-slate-200">
                    <Minus size={14} aria-hidden="true" />
                  </button>
                </div>
                <button type="button" onClick={() => remove(line.productId)} aria-label={`حذف ${line.name}`} className="text-xs font-bold text-red-600 hover:text-red-700 inline-flex items-center gap-1">
                  <Trash2 size={14} aria-hidden="true" /> حذف
                </button>
              </div>
            </div>
          ))}
        </div>

        <aside className="lg:col-span-1">
          <div className="rounded-[24px] border border-slate-100 bg-white p-5 lg:sticky lg:top-24">
            <h2 className="font-black text-slate-900">خلاصه سفارش</h2>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between text-slate-600">
                <dt>جمع کل کالاها</dt>
                <dd className="font-bold">{formatToman(subtotalR)}</dd>
              </div>
              <div className="flex justify-between text-slate-600">
                <dt>هزینه ارسال</dt>
                <dd className="font-bold">{shippingR === 0 ? 'رایگان' : formatToman(shippingR)}</dd>
              </div>
              <div className="h-px bg-slate-100 my-3" />
              <div className="flex justify-between items-center">
                <dt className="font-black text-slate-900">مبلغ قابل پرداخت</dt>
                <dd className="font-black text-[18px] text-[#FF4D00]">{formatToman(totalR)}</dd>
              </div>
            </dl>

            <Link
              to={ROUTES.checkout}
              className="mt-5 block w-full h-12 rounded-full bg-[#FF4D00] text-white font-black flex items-center justify-center hover:bg-[#E54400] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4D00] focus-visible:ring-offset-2"
            >
              ادامه فرایند خرید
            </Link>
            <Link to={ROUTES.home} className="mt-3 block w-full h-11 rounded-full border-2 border-slate-900 text-slate-900 font-black flex items-center justify-center hover:bg-slate-900 hover:text-white transition">
              ادامه خرید
            </Link>
>>>>>>> b2d024c (feat(web): harden storefront purchase flow)
          </div>
        </aside>
      </div>
    </div>
  )
}
<<<<<<< HEAD

const primaryButton =
  'mx-auto mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-slate-950 px-6 font-bold text-white hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2'

function CommerceNotice({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action: React.ReactNode
}) {
  return (
    <div className="mx-auto max-w-[640px] px-4 py-20 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-950 text-amber-400">
        <ShoppingBag size={28} />
      </div>
      <h1 className="mt-5 text-xl font-black text-slate-950">{title}</h1>
      <p className="mt-2 text-sm leading-7 text-slate-500">{description}</p>
      {action}
    </div>
  )
}
=======
>>>>>>> b2d024c (feat(web): harden storefront purchase flow)
