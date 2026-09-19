import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Check, MapPin, RefreshCw, ShieldCheck, Truck } from 'lucide-react'
import type { CheckoutAddress, ShippingQuote } from '@iranyaragh/contracts'
import { useCart } from '../state/cart-context'
import { useAuth } from '../state/auth-context'
import { formatToman, toPersianDigits } from '../lib/format'
import { ROUTES } from '../lib/routes'
import { createCheckoutIdempotencyKey } from '../services/cart/idempotency'
import { commerceErrorMessage } from '../services/commerce/errors'
import type { CheckoutPreview } from '../services/commerce/types'
import {
  IRAN_PROVINCES,
  IRAN_PROVINCE_CODES,
  isValidIranMobile,
  isValidIranPostalCode,
  normalizeIranMobile,
  normalizeIranPostalCode,
} from '../lib/iran'

type FormState = {
  recipient: string
  mobile: string
  province: string
  city: string
  postalCode: string
  address: string
}
type FormErrors = Partial<Record<keyof FormState, string>>

const INITIAL_FORM: FormState = {
  recipient: '',
  mobile: '',
  province: '',
  city: '',
  postalCode: '',
  address: '',
}
const inputClass =
  'h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm text-slate-950 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 disabled:bg-slate-100'

export function CheckoutPage() {
  const { state, api, reload } = useCart()
  const auth = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState(INITIAL_FORM)
  const [errors, setErrors] = useState<FormErrors>({})
  const [preview, setPreview] = useState<CheckoutPreview | null>(null)
  const [selectedQuoteId, setSelectedQuoteId] = useState('')
  const [busy, setBusy] = useState<'preview' | 'create' | null>(null)
  const [error, setError] = useState<unknown | null>(null)
  const checkoutKey = useRef<string | null>(null)

  const lines = preview?.cart.lines ?? state.cart.lines
  const quote =
    preview?.shipping.find((item) => item.quoteId === selectedQuoteId) ??
    preview?.shipping[0] ??
    null

  if (auth.state.phase !== 'authenticated') {
    return (
      <Centered
        title="برای تکمیل سفارش وارد شوید"
        description="آدرس و سفارش فقط به حساب احراز‌شده شما متصل می‌شود."
        action={
          <button type="button" onClick={auth.open} className={primaryButton}>
            ورود / ثبت‌نام
          </button>
        }
      />
    )
  }
  if (state.phase === 'loading')
    return (
      <div
        role="status"
        aria-live="polite"
        className="mx-auto max-w-[1280px] px-4 py-20 text-center text-slate-500"
      >
        در حال بررسی سبد خرید…
      </div>
    )
  if (lines.length === 0)
    return (
      <Centered
        title="سبد خرید خالی است"
        description="برای ثبت سفارش، ابتدا یک تنوع موجود به سبد اضافه کنید."
        action={
          <Link to={ROUTES.home} className={primaryButton}>
            بازگشت به فروشگاه
          </Link>
        }
      />
    )

  function setField<K extends keyof FormState>(key: K, value: string) {
    setForm((current) => ({ ...current, [key]: value }))
    setErrors((current) => ({ ...current, [key]: undefined }))
    setPreview(null)
    setSelectedQuoteId('')
    checkoutKey.current = null
  }

  function address(): CheckoutAddress {
    const province = form.province as keyof typeof IRAN_PROVINCE_CODES
    return {
      provinceCode: IRAN_PROVINCE_CODES[province],
      city: form.city.trim(),
      address: form.address.trim(),
      postalCode: normalizeIranPostalCode(form.postalCode),
      recipient: form.recipient.trim(),
      mobile: normalizeIranMobile(form.mobile),
    }
  }

  async function handlePreview(event: React.FormEvent) {
    event.preventDefault()
    const next = validate(form)
    setErrors(next)
    if (Object.values(next).some(Boolean)) return
    setBusy('preview')
    setError(null)
    try {
      const result = await api.previewCheckout(address())
      setPreview(result)
      setSelectedQuoteId(result.shipping[0]?.quoteId ?? '')
      checkoutKey.current = null
    } catch (cause) {
      setError(cause)
    } finally {
      setBusy(null)
    }
  }

  async function handleCreate() {
    if (!preview || !quote || busy) return
    setBusy('create')
    setError(null)
    try {
      checkoutKey.current ??= createCheckoutIdempotencyKey()
      const order = await api.createCheckout(
        address(),
        quote.quoteId,
        checkoutKey.current,
      )
      await reload().catch(() => undefined)
      navigate(ROUTES.payment(order.id), { replace: true })
    } catch (cause) {
      setError(cause)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="mx-auto max-w-[1280px] px-4 py-6 lg:px-6 lg:py-10">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-950 text-amber-400">
          <MapPin size={21} />
        </div>
        <div>
          <p className="text-xs font-bold text-amber-700">مرحله ۲ از خرید</p>
          <h1 className="text-xl font-black text-slate-950">
            آدرس و روش ارسال
          </h1>
        </div>
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <form
          onSubmit={handlePreview}
          noValidate
          className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
        >
          {Boolean(error) && (
            <div
              role="alert"
              aria-live="assertive"
              className="mb-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-800"
            >
              {commerceErrorMessage(error)}
            </div>
          )}
          <fieldset disabled={busy !== null}>
            <legend className="text-base font-black text-slate-950">
              مشخصات تحویل‌گیرنده
            </legend>
            <p className="mt-1 text-xs leading-6 text-slate-500">
              فقط اطلاعات لازم برای تحویل این سفارش دریافت می‌شود.
            </p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Field
                id="recipient"
                label="نام تحویل‌گیرنده"
                error={errors.recipient}
              >
                <input
                  id="recipient"
                  required
                  aria-required="true"
                  autoComplete="name"
                  value={form.recipient}
                  onChange={(event) =>
                    setField('recipient', event.target.value)
                  }
                  className={inputClass}
                  aria-invalid={Boolean(errors.recipient)}
                  aria-describedby={
                    errors.recipient ? 'recipient-error' : undefined
                  }
                />
              </Field>
              <Field id="mobile" label="شماره موبایل" error={errors.mobile}>
                <input
                  id="mobile"
                  required
                  aria-required="true"
                  dir="ltr"
                  inputMode="tel"
                  autoComplete="tel-national"
                  value={form.mobile}
                  onChange={(event) => setField('mobile', event.target.value)}
                  className={`${inputClass} text-right`}
                  aria-invalid={Boolean(errors.mobile)}
                  aria-describedby={errors.mobile ? 'mobile-error' : undefined}
                  placeholder="09123456789"
                />
              </Field>
              <Field id="province" label="استان" error={errors.province}>
                <select
                  id="province"
                  required
                  aria-required="true"
                  value={form.province}
                  onChange={(event) => setField('province', event.target.value)}
                  className={inputClass}
                  aria-invalid={Boolean(errors.province)}
                  aria-describedby={
                    errors.province ? 'province-error' : undefined
                  }
                >
                  <option value="">انتخاب استان</option>
                  {IRAN_PROVINCES.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </Field>
              <Field id="city" label="شهر" error={errors.city}>
                <input
                  id="city"
                  required
                  aria-required="true"
                  autoComplete="address-level2"
                  value={form.city}
                  onChange={(event) => setField('city', event.target.value)}
                  className={inputClass}
                  aria-invalid={Boolean(errors.city)}
                  aria-describedby={errors.city ? 'city-error' : undefined}
                />
              </Field>
              <Field id="postalCode" label="کد پستی" error={errors.postalCode}>
                <input
                  id="postalCode"
                  required
                  aria-required="true"
                  dir="ltr"
                  inputMode="numeric"
                  autoComplete="postal-code"
                  value={form.postalCode}
                  onChange={(event) =>
                    setField('postalCode', event.target.value)
                  }
                  className={`${inputClass} text-right`}
                  aria-invalid={Boolean(errors.postalCode)}
                  aria-describedby={
                    errors.postalCode ? 'postalCode-error' : undefined
                  }
                />
              </Field>
              <div className="sm:col-span-2">
                <Field id="address" label="نشانی کامل" error={errors.address}>
                  <textarea
                    id="address"
                    required
                    aria-required="true"
                    autoComplete="street-address"
                    value={form.address}
                    onChange={(event) =>
                      setField('address', event.target.value)
                    }
                    rows={4}
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                    aria-invalid={Boolean(errors.address)}
                    aria-describedby={
                      errors.address ? 'address-error' : undefined
                    }
                  />
                </Field>
              </div>
            </div>
          </fieldset>
          <button
            type="submit"
            disabled={busy !== null}
            className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 font-black text-white hover:bg-black disabled:opacity-60 sm:w-auto sm:px-7"
          >
            <RefreshCw
              size={17}
              className={
                busy === 'preview'
                  ? 'animate-spin motion-reduce:animate-none'
                  : ''
              }
            />
            {busy === 'preview'
              ? 'در حال بررسی…'
              : preview
                ? 'محاسبه دوباره'
                : 'محاسبه هزینه ارسال'}
          </button>

          {preview && (
            <fieldset className="mt-7 border-t border-slate-200 pt-6">
              <legend className="text-base font-black text-slate-950">
                روش ارسال
              </legend>
              <div className="mt-3 space-y-3">
                {preview.shipping.map((item) => (
                  <ShippingOption
                    key={item.quoteId}
                    item={item}
                    checked={item.quoteId === quote?.quoteId}
                    onChange={() => {
                      setSelectedQuoteId(item.quoteId)
                      checkoutKey.current = null
                    }}
                  />
                ))}
              </div>
            </fieldset>
          )}
        </form>

        <aside>
          <div className="rounded-[24px] bg-slate-950 p-5 text-white shadow-xl lg:sticky lg:top-28">
            <p className="text-xs font-bold text-amber-400">
              خلاصه تأییدشده سمت سرور
            </p>
            <h2 className="mt-1 text-lg font-black">
              {toPersianDigits(
                lines.reduce((sum, line) => sum + line.quantity, 0),
              )}{' '}
              کالا
            </h2>
            <ul className="mt-4 max-h-52 space-y-2 overflow-auto border-y border-white/10 py-4 text-sm">
              {lines.map((line) => (
                <li
                  key={line.variantId}
                  className="flex justify-between gap-3 text-slate-300"
                >
                  <span className="line-clamp-1">{line.title}</span>
                  <span className="shrink-0">
                    × {toPersianDigits(line.quantity)}
                  </span>
                </li>
              ))}
            </ul>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between text-slate-300">
                <dt>جمع کالاها</dt>
                <dd className="font-bold text-white">
                  {formatToman(
                    (preview?.cart ?? state.cart).quote.subtotal.amount,
                  )}
                </dd>
              </div>
              <div className="flex justify-between text-slate-300">
                <dt>ارسال انتخابی</dt>
                <dd className="font-bold text-white">
                  {quote ? formatToman(quote.amount.amount) : 'محاسبه نشده'}
                </dd>
              </div>
            </dl>
            <p className="mt-3 border-t border-white/10 pt-3 text-xs leading-6 text-slate-400">
              مبلغ نهایی پس از ثبت سفارش، مستقیماً از پاسخ سرور نمایش داده
              می‌شود.
            </p>
            <div className="mt-4 flex items-start gap-2 rounded-xl bg-white/5 p-3 text-xs leading-6 text-slate-300">
              <ShieldCheck
                className="mt-0.5 shrink-0 text-amber-400"
                size={16}
              />
              ثبت سفارش به معنی پرداخت نیست؛ پرداخت فقط پس از تأیید درگاه در
              سرور ثبت می‌شود.
            </div>
            <button
              type="button"
              onClick={() => void handleCreate()}
              disabled={!preview || !quote || busy !== null}
              className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-l from-amber-400 to-orange-500 font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Check size={18} />
              {busy === 'create' ? 'در حال ثبت سفارش…' : 'ثبت سفارش'}
            </button>
          </div>
        </aside>
      </div>
    </div>
  )
}

function validate(form: FormState): FormErrors {
  const errors: FormErrors = {}
  if (form.recipient.trim().length < 2)
    errors.recipient = 'نام تحویل‌گیرنده را وارد کنید.'
  if (!isValidIranMobile(form.mobile))
    errors.mobile = 'شماره موبایل معتبر ۱۱ رقمی وارد کنید.'
  if (
    !IRAN_PROVINCES.includes(form.province as (typeof IRAN_PROVINCES)[number])
  )
    errors.province = 'استان را انتخاب کنید.'
  if (form.city.trim().length < 2) errors.city = 'نام شهر را وارد کنید.'
  if (!isValidIranPostalCode(form.postalCode))
    errors.postalCode = 'کد پستی معتبر ۱۰ رقمی وارد کنید.'
  if (form.address.trim().length < 10)
    errors.address = 'نشانی کامل باید حداقل ۱۰ کاراکتر باشد.'
  return errors
}

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string
  label: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1.5 block text-xs font-bold text-slate-700"
      >
        {label}
      </label>
      {children}
      {error && (
        <p
          id={`${id}-error`}
          role="alert"
          className="mt-1 text-xs font-bold text-red-700"
        >
          {error}
        </p>
      )}
    </div>
  )
}
function ShippingOption({
  item,
  checked,
  onChange,
}: {
  item: ShippingQuote
  checked: boolean
  onChange: () => void
}) {
  return (
    <label
      className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-4 ${checked ? 'border-amber-500 bg-amber-50' : 'border-slate-200'}`}
    >
      <input
        type="radio"
        name="shipping"
        checked={checked}
        onChange={onChange}
      />
      <Truck className="text-slate-700" size={20} />
      <span className="min-w-0 flex-1">
        <span className="block font-black text-slate-950">{item.title}</span>
        <span className="text-xs text-slate-500">
          اعتبار تا{' '}
          {new Date(item.expiresAt).toLocaleTimeString('fa-IR', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      </span>
      <span className="font-black text-amber-700">
        {formatToman(item.amount.amount)}
      </span>
    </label>
  )
}
const primaryButton =
  'mx-auto mt-6 inline-flex h-11 items-center justify-center rounded-xl bg-slate-950 px-6 font-bold text-white hover:bg-black'
function Centered({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action: React.ReactNode
}) {
  return (
    <div className="mx-auto max-w-[620px] px-4 py-20 text-center">
      <h1 className="text-xl font-black text-slate-950">{title}</h1>
      <p className="mt-2 text-sm leading-7 text-slate-500">{description}</p>
      {action}
    </div>
  )
}
