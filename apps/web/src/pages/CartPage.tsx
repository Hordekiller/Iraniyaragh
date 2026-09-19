import { Link } from 'react-router-dom'
import { Minus, Plus, RefreshCw, ShoppingBag, Trash2 } from 'lucide-react'
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

  if (auth.state.phase !== 'authenticated') {
    return (
      <CommerceNotice
        title="برای مشاهده سبد خرید وارد شوید"
        description="سبد خرید روی حساب شما و با قیمت و موجودی لحظه‌ای نگهداری می‌شود."
        action={
          <button type="button" onClick={auth.open} className={primaryButton}>
            ورود / ثبت‌نام
          </button>
        }
      />
    )
  }

  if (state.phase === 'loading') {
    return (
      <div
        className="mx-auto max-w-[1280px] px-4 py-20 text-center text-slate-500"
        role="status"
        aria-live="polite"
      >
        در حال دریافت سبد خرید…
      </div>
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
          className="text-sm font-bold text-red-700 hover:text-red-800"
        >
          حذف همه
        </button>
      </div>

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
            <RefreshCw size={15} /> به‌روزرسانی سبد
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
                    disabled={pending}
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
                        line.quantity >= line.available ||
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
                      disabled={pending}
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
            <Link
              to={ROUTES.checkout}
              className="mt-5 flex h-12 w-full items-center justify-center rounded-xl bg-gradient-to-l from-amber-400 to-orange-500 font-black text-slate-950 hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
            >
              ادامه فرایند خرید
            </Link>
          </div>
        </aside>
      </div>
    </div>
  )
}

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
