import { useId, useState } from 'react'
import { BadgePercent, Loader2, X } from 'lucide-react'
import type { CartPromotionView } from '@iranyaragh/contracts'
import { useCart } from '../../state/cart-context'
import { commerceErrorMessage } from '../../services/commerce/errors'

const CODE_PATTERN = /^[A-Za-z0-9۰-۹٠-٩ _-]{1,64}$/

/** Coupon entry; the server alone decides eligibility and the amounts shown. */
export function CouponBox({ authenticated, promotion }: { authenticated: boolean; promotion?: CartPromotionView }) {
  const { applyCoupon, removeCoupon, pendingCoupon, setPendingCoupon, couponNotice, dismissCouponNotice } = useCart()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputId = useId()
  const applied = promotion?.couponCode && !promotion.couponError ? promotion.couponCode : null

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const value = code.trim()
    if (!CODE_PATTERN.test(value)) {
      setError('کد تخفیف را به‌صورت حروف یا عدد وارد کنید.')
      return
    }
    setError(null)
    if (!authenticated) {
      setPendingCoupon(value)
      setCode('')
      return
    }
    setBusy(true)
    try {
      await applyCoupon(value)
      setCode('')
    } catch (cause) {
      setError(commerceErrorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    setBusy(true)
    setError(null)
    try {
      await removeCoupon()
    } catch (cause) {
      setError(commerceErrorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby={`${inputId}-title`} className="mt-5 rounded-2xl bg-white/5 p-4">
      <h3 id={`${inputId}-title`} className="flex items-center gap-2 text-sm font-black text-white">
        <BadgePercent size={16} className="text-amber-400" aria-hidden="true" />
        کد تخفیف
      </h3>
      {couponNotice && (
        <p role="status" className="mt-2 text-xs leading-6 text-amber-200">
          {couponNotice}{' '}
          <button type="button" onClick={dismissCouponNotice} className="underline">بستن</button>
        </p>
      )}
      {applied ? (
        <div className="mt-3 flex items-center justify-between gap-2 rounded-xl bg-emerald-500/15 px-3 py-2 text-sm text-emerald-100">
          <span dir="ltr" className="font-black">{applied}</span>
          <button
            type="button"
            onClick={() => void remove()}
            disabled={busy}
            aria-label={`حذف کد تخفیف ${applied}`}
            className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/10 disabled:opacity-40"
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <X size={16} />}
          </button>
        </div>
      ) : (
        <form onSubmit={(e) => void submit(e)} className="mt-3 flex gap-2">
          <label htmlFor={inputId} className="sr-only">کد تخفیف</label>
          <input
            id={inputId}
            dir="ltr"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            maxLength={64}
            autoComplete="off"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${inputId}-error` : undefined}
            className="h-11 min-w-0 flex-1 rounded-xl border border-white/20 bg-white/10 px-3 text-sm text-white placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
            placeholder="مثلاً SAVE10"
          />
          <button
            type="submit"
            disabled={busy || code.trim() === ''}
            className="h-11 shrink-0 rounded-xl bg-white px-4 text-sm font-black text-slate-950 disabled:opacity-40"
          >
            {busy ? 'در حال بررسی…' : 'اعمال'}
          </button>
        </form>
      )}
      {!authenticated && pendingCoupon && (
        <p className="mt-2 text-xs leading-6 text-slate-300">
          کد <span dir="ltr" className="font-black">{pendingCoupon}</span> ذخیره شد و پس از ورود بررسی و اعمال می‌شود.{' '}
          <button type="button" onClick={() => setPendingCoupon(null)} className="underline">حذف</button>
        </p>
      )}
      {(error ?? promotion?.couponError?.message) && (
        <p id={`${inputId}-error`} role="alert" className="mt-2 text-xs font-bold leading-6 text-red-300">
          {error ?? promotion?.couponError?.message}
        </p>
      )}
    </section>
  )
}
