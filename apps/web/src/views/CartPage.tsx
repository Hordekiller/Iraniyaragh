import { Link } from 'react-router-dom'
import {
  Info,
  LogIn,
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
import { CouponBox } from '../components/cart/CouponBox'
import { QuantityStepper } from '../components/cart/QuantityStepper'
import { MAX_CART_LINE_QUANTITY } from '@iranyaragh/contracts'

export function CartPage() {
  const { state, setQuantity, remove, clear, reload } = useCart()
  const auth = useAuth()
  const lines = state.cart.lines
  const itemCount = lines.reduce((sum, line) => sum + line.quantity, 0)
  // Checkout would be refused for these; say so here instead of at the next step.
  const overStock = lines.some((line) => line.quantity > line.available)
  const saving = state.pendingVariantIds.length > 0

  if (state.phase === 'idle' || state.phase === 'loading') {
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
        >
          حذف همه
        </button>
      </div>

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
                  ? 'تعداد یکی از کالاهای مشترک به بیشترین مقدار قابل ثبت رسید.'
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

      <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <ul className="space-y-3" aria-label="اقلام سبد خرید" data-help="cart-items">
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
                  <QuantityStepper
                    size="sm"
                    itemName={line.title}
                    value={line.quantity}
                    max={Math.min(MAX_CART_LINE_QUANTITY, line.available)}
                    maxReason={line.available < MAX_CART_LINE_QUANTITY ? 'stock' : 'limit'}
                    onCommit={(quantity) => setQuantity(line.variantId, quantity)}
                    onRemove={() => setQuantity(line.variantId, 0)}
                    describeError={commerceErrorMessage}
                    disabled={state.phase === 'merging'}
                    className="items-end"
                  />
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
              {state.cart.promotion?.applied.map((item) => (
                <div key={item.promotionId} className="flex justify-between gap-4 text-emerald-300">
                  <dt>{item.name}</dt>
                  <dd className="font-black">
                    {BigInt(item.discount.amount) > 0n ? `− ${formatToman(item.discount.amount)}` : 'ارسال رایگان'}
                  </dd>
                </div>
              ))}
              <div className="flex justify-between gap-4 text-slate-300">
                <dt>ارسال</dt>
                <dd>پس از ثبت آدرس</dd>
              </div>
              {state.cart.promotion && BigInt(state.cart.promotion.itemDiscount.amount) > 0n && (
                <div className="flex justify-between gap-4 border-t border-white/10 pt-3 text-slate-300">
                  <dt>مبلغ کالاها پس از تخفیف</dt>
                  <dd className="font-black text-white">{formatToman(state.cart.promotion.payable.amount)}</dd>
                </div>
              )}
            </dl>
            <CouponBox authenticated={state.owner === 'customer'} promotion={state.cart.promotion} />
            <p className="mt-4 border-t border-white/10 pt-4 text-xs leading-6 text-slate-400">
              قیمت، موجودی و هزینه ارسال در مرحله بعد دوباره توسط سرور بررسی
              می‌شود.
            </p>
            {overStock && (
              <p role="alert" className="mt-4 rounded-xl bg-red-500/15 p-3 text-xs font-bold leading-6 text-red-200">
                تعداد یک یا چند کالا بیشتر از موجودی قابل سفارش است. پیش از ادامه، تعداد را اصلاح کنید.
              </p>
            )}
            {state.owner === 'customer' ? (
              <Link
                to={ROUTES.checkout}
                data-help="cart-continue"
                aria-disabled={overStock || saving || undefined}
                onClick={(event) => {
                  // Never continue with a quantity the server has not confirmed or cannot supply.
                  if (overStock || saving) event.preventDefault()
                }}
                className={`mt-5 flex h-12 w-full items-center justify-center rounded-xl bg-gradient-to-l from-amber-400 to-orange-500 font-black text-slate-950 hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 ${overStock ? 'cursor-not-allowed opacity-50' : ''}`}
              >
                ادامه فرایند خرید
              </Link>
            ) : auth.state.phase === 'authenticated' ? (
              <button
                type="button"
                data-help="cart-continue"
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
                data-help="cart-continue"
                onClick={auth.open}
                className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-l from-amber-400 to-orange-500 font-black text-slate-950 hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
              >
                <LogIn size={17} aria-hidden="true" />
                ورود با موبایل و ادامه خرید
              </button>
            )}
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
