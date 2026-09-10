import { useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useCart } from '../state/cart-context'
import { useOrderApi } from '../state/order-context'
import { formatToman, toPersianDigits } from '../lib/format'
import { ROUTES } from '../lib/routes'
import { lineTotalRials } from '../services/cart/types'
import type { OrderItem } from '../services/cart/types'
import { FREE_SHIPPING_THRESHOLD_RIALS, SHIPPING_COST_RIALS } from '../lib/site-config'
import { IRAN_PROVINCES, isValidIranMobile, isValidIranPostalCode, normalizeIranMobile, normalizeIranPostalCode } from '../lib/iran'

type FormState = {
  fullName: string
  mobile: string
  province: string
  city: string
  postalCode: string
  address: string
  note: string
}

const INITIAL_FORM: FormState = {
  fullName: '',
  mobile: '',
  province: '',
  city: '',
  postalCode: '',
  address: '',
  note: '',
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

const inputClass =
  'w-full h-12 px-4 rounded-2xl bg-slate-50 border border-slate-200 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#FF4D00]/30 focus:border-[#FF4D00]'

export function CheckoutPage() {
  const { state } = useCart()
  const orders = useOrderApi()
  const navigate = useNavigate()

  const [form, setForm] = useState<FormState>(INITIAL_FORM)
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const idempotencyKey = useRef<string | null>(null)

  const subtotalR = useMemo(
    () => state.lines.reduce((sum, line) => sum + lineTotalRials(line), 0),
    [state.lines],
  )
  const shippingR = subtotalR >= FREE_SHIPPING_THRESHOLD_RIALS ? 0 : SHIPPING_COST_RIALS
  const totalR = subtotalR + shippingR

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
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setFormError(null)
    const nextErrors = validate(form)
    setErrors(nextErrors)
    if (Object.values(nextErrors).some(Boolean)) return

    setSubmitting(true)
    idempotencyKey.current ??= `checkout-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`
    const items: OrderItem[] = state.lines.map(line => ({
      productId: line.productId,
      slug: line.slug,
      name: line.name,
      image: line.image,
      unitPrice: line.unitPrice,
      quantity: line.quantity,
    }))

    try {
      const order = await orders.createOrder({
        idempotencyKey: idempotencyKey.current,
        items,
        subtotalRials: subtotalR,
        shippingRials: shippingR,
        totalRials: totalR,
        shipping: {
          fullName: form.fullName.trim(),
          mobile: normalizeIranMobile(form.mobile),
          province: form.province.trim(),
          city: form.city.trim(),
          postalCode: normalizeIranPostalCode(form.postalCode),
          address: form.address.trim(),
        },
        note: form.note.trim(),
      })
      navigate(ROUTES.payment(order.id))
    } catch {
      setSubmitting(false)
      setFormError('ثبت سفارش با خطا مواجه شد. لطفاً دوباره تلاش کنید.')
    }
  }

  return (
    <div className="max-w-[1280px] mx-auto px-4 lg:px-6 py-6">
      <h1 className="font-black text-slate-900 text-lg lg:text-xl">تکمیل سفارش</h1>

      <div className="mt-6 grid lg:grid-cols-3 gap-6">
        <form onSubmit={handleSubmit} noValidate className="lg:col-span-2 space-y-5 rounded-[24px] border border-slate-100 bg-white p-5">
          {formError && (
            <p role="alert" className="rounded-2xl bg-red-50 border border-red-200 text-red-700 p-4 text-sm font-bold">{formError}</p>
          )}
          <fieldset disabled={submitting} className="space-y-4">
            <legend className="font-black text-slate-900 mb-1">اطلاعات گیرنده</legend>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="fullName" className="block text-xs font-bold text-slate-600 mb-1.5">نام و نام خانوادگی</label>
                <input id="fullName" value={form.fullName} onChange={e => set('fullName', e.target.value)} className={inputClass} placeholder="مثلاً علی رضایی" />
                {errors.fullName && <p className="mt-1 text-xs text-red-600">{errors.fullName}</p>}
              </div>
              <div>
                <label htmlFor="mobile" className="block text-xs font-bold text-slate-600 mb-1.5">شماره موبایل</label>
                <input id="mobile" dir="ltr" inputMode="numeric" autoComplete="tel-national" value={form.mobile} onChange={e => set('mobile', normalizeIranMobile(e.target.value))} className={`${inputClass} text-right`} placeholder="09123456789" aria-invalid={Boolean(errors.mobile)} aria-describedby={errors.mobile ? 'mobile-error' : undefined} />
                {errors.mobile && <p id="mobile-error" className="mt-1 text-xs text-red-600">{errors.mobile}</p>}
              </div>
              <div>
                <label htmlFor="province" className="block text-xs font-bold text-slate-600 mb-1.5">استان</label>
                <select id="province" value={form.province} onChange={e => set('province', e.target.value)} className={inputClass} aria-invalid={Boolean(errors.province)} aria-describedby={errors.province ? 'province-error' : undefined}>
                  <option value="">استان را انتخاب کنید</option>
                  {IRAN_PROVINCES.map(province => <option key={province} value={province}>{province}</option>)}
                </select>
                {errors.province && <p id="province-error" className="mt-1 text-xs text-red-600">{errors.province}</p>}
              </div>
              <div>
                <label htmlFor="city" className="block text-xs font-bold text-slate-600 mb-1.5">شهر</label>
                <input id="city" value={form.city} onChange={e => set('city', e.target.value)} className={inputClass} placeholder="مثلاً تهران" />
                {errors.city && <p className="mt-1 text-xs text-red-600">{errors.city}</p>}
              </div>
              <div>
                <label htmlFor="postalCode" className="block text-xs font-bold text-slate-600 mb-1.5">کد پستی</label>
                <input id="postalCode" dir="ltr" inputMode="numeric" autoComplete="postal-code" value={form.postalCode} onChange={e => set('postalCode', normalizeIranPostalCode(e.target.value))} className={`${inputClass} text-right`} placeholder="۱۰ رقمی" aria-invalid={Boolean(errors.postalCode)} aria-describedby={errors.postalCode ? 'postal-code-error' : undefined} />
                {errors.postalCode && <p id="postal-code-error" className="mt-1 text-xs text-red-600">{errors.postalCode}</p>}
              </div>
            </div>
            <div>
              <label htmlFor="address" className="block text-xs font-bold text-slate-600 mb-1.5">آدرس کامل</label>
              <textarea id="address" value={form.address} onChange={e => set('address', e.target.value)} rows={3} className="w-full px-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#FF4D00]/30 focus:border-[#FF4D00]" placeholder="خیابان، کوچه، پلاک، واحد" />
              {errors.address && <p className="mt-1 text-xs text-red-600">{errors.address}</p>}
            </div>
            <div>
              <label htmlFor="note" className="block text-xs font-bold text-slate-600 mb-1.5">توضیحات (اختیاری)</label>
              <textarea id="note" value={form.note} onChange={e => set('note', e.target.value)} rows={2} className="w-full px-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#FF4D00]/30 focus:border-[#FF4D00]" placeholder="توضیحات تکمیلی" />
            </div>
          </fieldset>

          <button
            type="submit"
            disabled={submitting}
            className="w-full h-12 rounded-full bg-[#0F172A] text-white font-black hover:bg-black disabled:opacity-60 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
          >
            {submitting ? 'در حال ثبت سفارش...' : 'ثبت سفارش و پرداخت'}
          </button>
        </form>

        <aside className="lg:col-span-1">
          <div className="rounded-[24px] border border-slate-100 bg-white p-5 lg:sticky lg:top-24">
            <h2 className="font-black text-slate-900">خلاصه سفارش</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {state.lines.map(line => (
                <li key={line.productId} className="flex justify-between gap-3 text-slate-600">
                  <span className="line-clamp-1">{line.name}</span>
                  <span className="font-bold shrink-0">× {toPersianDigits(line.quantity)}</span>
                </li>
              ))}
            </ul>
            <div className="h-px bg-slate-100 my-4" />
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-slate-600">
                <span>جمع کالاها</span>
                <span className="font-bold">{formatToman(subtotalR)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>ارسال</span>
                <span className="font-bold">{shippingR === 0 ? 'رایگان' : formatToman(shippingR)}</span>
              </div>
              <div className="flex justify-between items-center pt-2">
                <span className="font-black text-slate-900">قابل پرداخت</span>
                <span className="font-black text-[17px] text-[#FF4D00]">{formatToman(totalR)}</span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
