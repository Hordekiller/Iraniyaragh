import { useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useCart } from '../state/cart-context'
import { useAuth } from '../state/auth-context'
import { useCommerce } from '../services/commerce/context'
import type { CartView, CheckoutAddress, ShippingQuote } from '@iranyaragh/contracts'
import { formatToman, toPersianDigits } from '../lib/format'
import { ROUTES } from '../lib/routes'
import { createCheckoutIdempotencyKey } from '../services/commerce/idempotency'
import { commerceErrorMessage } from '../services/commerce/types'
import { IRAN_PROVINCES, isValidIranMobile, isValidIranPostalCode, normalizeIranMobile, normalizeIranPostalCode, provinceCodeFor } from '../lib/iran'
import { MOBILE_PLACEHOLDER } from '../lib/site-config'
import { useDocumentMeta } from '../lib/use-document-meta'
import { LoadFailure } from '../components/feedback/LoadFailure'

type FormState = {
  fullName: string
  mobile: string
  province: string
  city: string
  postalCode: string
  address: string
}

const INITIAL_FORM: FormState = {
  fullName: '',
  mobile: '',
  province: '',
  city: '',
  postalCode: '',
  address: '',
}

function validate(form: FormState): Partial<Record<keyof FormState, string>> {
  const errors: Partial<Record<keyof FormState, string>> = {}
  if (!form.fullName.trim()) errors.fullName = 'نام و نام خانوادگی را وارد کنید'
  if (!isValidIranMobile(form.mobile)) errors.mobile = 'شماره موبایل معتبر (۱۱ رقم، شروع با ۰۹) وارد کنید'
  if (!IRAN_PROVINCES.includes(form.province as (typeof IRAN_PROVINCES)[number])) errors.province = 'استان را انتخاب کنید'
  if (form.city.trim().length < 2) errors.city = 'نام شهر را وارد کنید'
  if (!isValidIranPostalCode(form.postalCode)) errors.postalCode = 'کد پستی ۱۰ رقمی وارد کنید'
  if (form.address.trim().length < 10) errors.address = 'آدرس کامل (حداقل ۱۰ کاراکتر) وارد کنید'
  return errors
}

/**
 * The order fields are validated and reported in this order, so the summary and
 * the focus move always agree with what the customer sees top to bottom.
 */
const FIELD_ORDER = [
  'fullName',
  'mobile',
  'province',
  'city',
  'postalCode',
  'address',
] as const satisfies readonly (keyof FormState)[]

/** Human labels, kept next to the fields so the summary never drifts. */
const FIELD_LABEL: Record<keyof FormState, string> = {
  fullName: 'نام و نام خانوادگی',
  mobile: 'شماره موبایل',
  province: 'استان',
  city: 'شهر',
  postalCode: 'کد پستی',
  address: 'آدرس کامل',
}

type CheckoutErrors = Partial<Record<keyof FormState, string>>

/**
 * A single, focusable list of everything that is wrong with the form.
 *
 * Per-field messages are not enough on their own: on submit, a screen-reader
 * user has no way to know that validation failed before the field they are on,
 * and a summary is the pattern GOV.UK and WCAG 3.3.1 both point to.
 */
function ErrorSummary({
  errors,
  onJump,
}: {
  errors: CheckoutErrors
  onJump: (field: keyof FormState) => void
}) {
  const active = FIELD_ORDER.filter(field => errors[field])
  if (active.length === 0) return null

  return (
    <div
      role="alert"
      tabIndex={-1}
      className="rounded-2xl border border-red-200 bg-red-50 p-4"
    >
      <p className="text-sm font-bold text-red-700">
        {`${toPersianDigits(active.length)} فیلد نیاز به اصلاح دارد:`}
      </p>
      <ul className="mt-2 space-y-1">
        {active.map(field => (
          <li key={field} className="text-xs text-red-700">
            <button
              type="button"
              onClick={() => onJump(field)}
              className="text-right underline underline-offset-2 hover:text-red-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 rounded"
            >
              {`${FIELD_LABEL[field]}: ${errors[field]}`}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

const inputClass =
  'w-full h-12 px-4 rounded-2xl bg-slate-50 border border-slate-200 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#FF4D00]/30 focus:border-[#FF4D00]'

export function CheckoutPage() {
  useDocumentMeta({ title: 'تکمیل خرید', noindex: true })
  const { state, totals, loading, error: cartError, refresh } = useCart()
  const { state: authState, open } = useAuth()
  const { checkout } = useCommerce()
  const navigate = useNavigate()

  const [form, setForm] = useState<FormState>(INITIAL_FORM)
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [creating, setCreating] = useState(false)
  const [preview, setPreview] = useState<{ cart: CartView; shipping: ShippingQuote[] } | null>(null)
  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(null)
  const idempotencyKey = useRef<string | null>(null)

  const authenticated = authState.restored && authState.phase === 'authenticated' && Boolean(authState.principal)

  const summary = useMemo(() => {
    if (preview) {
      return {
        lines: preview.cart.lines.map(line => ({ key: line.variantId, name: line.title, quantity: line.quantity })),
        subtotal: Number(preview.cart.quote.subtotal.amount),
        shipping: Number(preview.cart.quote.shipping.amount),
        total: Number(preview.cart.quote.total.amount),
      }
    }
    return {
      lines: state.lines.map(line => ({ key: line.variantId, name: line.name, quantity: line.quantity })),
      subtotal: totals.subtotalRials,
      shipping: totals.shippingRials,
      total: totals.totalRials,
    }
  }, [preview, state.lines, totals])

  // A hard refresh or a deep link lands here before the silent session restore
  // has settled, so the sign-in wall must not be shown yet: doing so flashed
  // "sign in" at customers who were already signed in.
  if (!authState.restored) {
    return (
      <p role="status" className="max-w-[1280px] mx-auto px-4 py-20 text-center text-slate-500">
        در حال بررسی نشست...
      </p>
    )
  }

  if (!authenticated) {
    return (
      <div className="max-w-[1280px] mx-auto px-4 py-20 text-center">
        <h1 className="font-black text-slate-900 text-xl">برای تکمیل سفارش وارد شوید</h1>
        <p className="mt-2 text-slate-500 text-sm">سبد خرید شما محفوظ میماند؛ پس از ورود، سفارش را نهایی میکنیم.</p>
        <button type="button" onClick={open} className="inline-flex items-center mt-6 h-11 px-6 rounded-full bg-[#0F172A] text-white font-bold hover:bg-black transition">
          ورود / ثبتنام با موبایل
        </button>
      </div>
    )
  }

  if (loading && state.lines.length === 0) {
    return <div className="max-w-[1280px] mx-auto px-4 py-20 text-center text-slate-500">در حال بارگذاری سبد خرید...</div>
  }

  // A cart read that failed is not an empty cart: reporting "your cart is empty"
  // here sent customers away from a cart that was still on the server.
  if (cartError && state.lines.length === 0) {
    return (
      <div className="max-w-[1280px] mx-auto px-4 py-20">
        <LoadFailure onRetry={() => void refresh()} title="سبد خرید بارگذاری نشد" message={cartError} />
      </div>
    )
  }

  if (state.lines.length === 0) {
    return (
      <div className="max-w-[1280px] mx-auto px-4 py-20 text-center">
        <h1 className="font-black text-slate-900 text-xl">سبد خرید خالی است</h1>
        <p className="mt-2 text-slate-500 text-sm">برای ثبت سفارش، ابتدا محصولی به سبد اضافه کنید.</p>
        <Link to={ROUTES.home} className="inline-flex items-center gap-2 mt-6 h-11 px-6 rounded-full bg-[#0F172A] text-white font-bold hover:bg-black transition">
          بازگشت به فروشگاه
        </Link>
      </div>
    )
  }

  function set<K extends keyof FormState>(key: K, value: string) {
    setForm(f => ({ ...f, [key]: value }))
    setErrors(e => ({ ...e, [key]: undefined }))
    setPreview(null)
    setSelectedQuoteId(null)
  }

  function buildAddress(): CheckoutAddress {
    return {
      provinceCode: provinceCodeFor(form.province) ?? form.province.trim(),
      city: form.city.trim(),
      address: form.address.trim(),
      postalCode: normalizeIranPostalCode(form.postalCode),
      recipient: form.fullName.trim(),
      mobile: normalizeIranMobile(form.mobile),
    }
  }

  async function handlePreview(event: React.FormEvent) {
    event.preventDefault()
    if (preview) return
    setFormError(null)
    const nextErrors = validate(form)
    setErrors(nextErrors)
    if (Object.values(nextErrors).some(Boolean)) {
      // 3.3.1 Error Identification / 3.3.3 Error Suggestion: a failed submit has
      // to tell the customer what is wrong, where it is, and put the cursor on
      // the first problem instead of leaving it wherever the submit button is.
      const firstInvalid = FIELD_ORDER.find(field => nextErrors[field])
      if (firstInvalid) document.getElementById(firstInvalid)?.focus()
      return
    }

    setPreviewing(true)
    try {
      const result = await checkout.preview(buildAddress())
      setPreview(result)
      setSelectedQuoteId(result.shipping[0]?.quoteId ?? null)
    } catch (cause) {
      setFormError(commerceErrorMessage(cause))
    } finally {
      setPreviewing(false)
    }
  }

  async function handleCreate() {
    if (!preview || !selectedQuoteId) return
    setFormError(null)
    setCreating(true)
    try {
      idempotencyKey.current ??= createCheckoutIdempotencyKey()
      const order = await checkout.create(buildAddress(), selectedQuoteId, idempotencyKey.current)
      await refresh()
      navigate(ROUTES.payment(order.id))
    } catch (cause) {
      setCreating(false)
      setFormError(commerceErrorMessage(cause))
    }
  }

  return (
    <div className="max-w-[1280px] mx-auto px-4 lg:px-6 py-6">
      <h1 className="font-black text-slate-900 text-lg lg:text-xl">تکمیل سفارش</h1>

      <div className="mt-6 grid lg:grid-cols-3 gap-6">
        <form onSubmit={handlePreview} noValidate className="lg:col-span-2 space-y-5 rounded-[24px] border border-slate-100 bg-white p-5">
          {formError && (
            <p role="alert" className="rounded-2xl bg-red-50 border border-red-200 text-red-700 p-4 text-sm font-bold">{formError}</p>
          )}
          <ErrorSummary errors={errors} onJump={field => document.getElementById(field)?.focus()} />
          <fieldset disabled={previewing || creating} className="space-y-4">
            <legend className="font-black text-slate-900 mb-1">اطلاعات گیرنده</legend>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="fullName" className="block text-xs font-bold text-slate-600 mb-1.5">نام و نام خانوادگی</label>
                <input id="fullName" value={form.fullName} onChange={e => set('fullName', e.target.value)} className={inputClass} placeholder="مثلاً علی رضایی" autoComplete="name" aria-invalid={Boolean(errors.fullName)} aria-describedby={errors.fullName ? 'full-name-error' : undefined} />
                {errors.fullName && <p id="full-name-error" className="mt-1 text-xs text-red-600">{errors.fullName}</p>}
              </div>
              <div>
                <label htmlFor="mobile" className="block text-xs font-bold text-slate-600 mb-1.5">شماره موبایل</label>
                <input id="mobile" type="tel" dir="ltr" inputMode="numeric" autoComplete="tel-national" value={form.mobile} onChange={e => set('mobile', normalizeIranMobile(e.target.value))} className={`${inputClass} text-right`} placeholder={MOBILE_PLACEHOLDER} aria-invalid={Boolean(errors.mobile)} aria-describedby={errors.mobile ? 'mobile-error' : undefined} />
                {errors.mobile && <p id="mobile-error" className="mt-1 text-xs text-red-600">{errors.mobile}</p>}
              </div>
              <div>
                <label htmlFor="province" className="block text-xs font-bold text-slate-600 mb-1.5">استان</label>
                <select id="province" autoComplete="address-level1" value={form.province} onChange={e => set('province', e.target.value)} className={inputClass} aria-invalid={Boolean(errors.province)} aria-describedby={errors.province ? 'province-error' : undefined}>
                  <option value="">استان را انتخاب کنید</option>
                  {IRAN_PROVINCES.map(province => <option key={province} value={province}>{province}</option>)}
                </select>
                {errors.province && <p id="province-error" className="mt-1 text-xs text-red-600">{errors.province}</p>}
              </div>
              <div>
                <label htmlFor="city" className="block text-xs font-bold text-slate-600 mb-1.5">شهر</label>
                <input id="city" value={form.city} onChange={e => set('city', e.target.value)} className={inputClass} placeholder="مثلاً تهران" autoComplete="address-level2" aria-invalid={Boolean(errors.city)} aria-describedby={errors.city ? 'city-error' : undefined} />
                {errors.city && <p id="city-error" className="mt-1 text-xs text-red-600">{errors.city}</p>}
              </div>
              <div>
                <label htmlFor="postalCode" className="block text-xs font-bold text-slate-600 mb-1.5">کد پستی</label>
                <input id="postalCode" dir="ltr" inputMode="numeric" autoComplete="postal-code" value={form.postalCode} onChange={e => set('postalCode', normalizeIranPostalCode(e.target.value))} className={`${inputClass} text-right`} placeholder="۱۰ رقمی" aria-invalid={Boolean(errors.postalCode)} aria-describedby={errors.postalCode ? 'postal-code-error' : undefined} />
                {errors.postalCode && <p id="postal-code-error" className="mt-1 text-xs text-red-600">{errors.postalCode}</p>}
              </div>
            </div>
            <div>
              <label htmlFor="address" className="block text-xs font-bold text-slate-600 mb-1.5">آدرس کامل</label>
              <textarea id="address" value={form.address} onChange={e => set('address', e.target.value)} rows={3} className="w-full px-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#FF4D00]/30 focus:border-[#FF4D00]" placeholder="خیابان، کوچه، پلاک، واحد" autoComplete="street-address" aria-invalid={Boolean(errors.address)} aria-describedby={errors.address ? 'address-error' : undefined} />
              {errors.address && <p id="address-error" className="mt-1 text-xs text-red-600">{errors.address}</p>}
            </div>
          </fieldset>

          {preview ? (
            <div className="space-y-4">
              <div>
                <h2 className="text-xs font-black text-slate-700 mb-2">روش ارسال</h2>
                {preview.shipping.length === 0 ? (
                  <p className="text-sm text-slate-500">در حال حاضر روش ارسالی برای این مقصد در دسترس نیست.</p>
                ) : (
                  <div className="space-y-2" role="radiogroup" aria-label="روش ارسال">
                    {preview.shipping.map(quote => (
                      <label
                        key={quote.quoteId}
                        className={[
                          'flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-sm cursor-pointer',
                          selectedQuoteId === quote.quoteId ? 'border-[#0F172A] bg-slate-50' : 'border-slate-200',
                        ].join(' ')}
                      >
                        <span className="flex items-center gap-2">
                          <input
                            type="radio"
                            name="shipping"
                            value={quote.quoteId}
                            checked={selectedQuoteId === quote.quoteId}
                            onChange={() => setSelectedQuoteId(quote.quoteId)}
                          />
                          <span className="font-bold text-slate-900">{quote.title}</span>
                        </span>
                        <span className="font-bold text-slate-700">
                          {Number(quote.amount.amount) === 0 ? 'رایگان' : formatToman(quote.amount.amount)}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={creating || !selectedQuoteId}
                  className="flex-1 h-12 rounded-full bg-[#0F172A] text-white font-black hover:bg-black disabled:opacity-60 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
                >
                  {creating ? 'در حال ثبت سفارش...' : 'ثبت نهایی سفارش'}
                </button>
                <button
                  type="button"
                  onClick={() => { setPreview(null); setSelectedQuoteId(null) }}
                  disabled={creating}
                  className="h-12 px-5 rounded-full border-2 border-slate-900 font-black hover:bg-slate-900 hover:text-white transition"
                >
                  ویرایش آدرس
                </button>
              </div>
            </div>
          ) : (
            <button
              type="submit"
              disabled={previewing}
              className="w-full h-12 rounded-full bg-[#0F172A] text-white font-black hover:bg-black disabled:opacity-60 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
            >
              {previewing ? 'در حال محاسبه ارسال...' : 'ادامه و محاسبه ارسال'}
            </button>
          )}
        </form>

        <aside className="lg:col-span-1">
          <div className="rounded-[24px] border border-slate-100 bg-white p-5 lg:sticky lg:top-24">
            <h2 className="font-black text-slate-900">خلاصه سفارش</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {summary.lines.map(line => (
                <li key={line.key} className="flex justify-between gap-3 text-slate-600">
                  <span className="line-clamp-1">{line.name}</span>
                  <span className="font-bold shrink-0">× {toPersianDigits(line.quantity)}</span>
                </li>
              ))}
            </ul>
            <div className="h-px bg-slate-100 my-4" />
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-slate-600">
                <span>جمع کالاها</span>
                <span className="font-bold">{formatToman(summary.subtotal)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>ارسال</span>
                <span className="font-bold">{preview ? (summary.shipping === 0 ? 'رایگان' : formatToman(summary.shipping)) : 'پس از ادامه محاسبه میشود'}</span>
              </div>
              <div className="flex justify-between items-center pt-2">
                <span className="font-black text-slate-900">قابل پرداخت</span>
                <span className="font-black text-[17px] text-[#C2410C]">{formatToman(summary.total)}</span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}