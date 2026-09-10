import { useState } from 'react'
import { brandsRow } from '../../data/prototype'
import { useToast } from '../feedback/toast-context'
import { NEWSLETTER_DISCOUNT_TOMAN, TOTAL_BRAND_COUNT } from '../../lib/site-config'
import { formatPersianNumber, toLatinDigits } from '../../lib/format'
import { isValidNewsletterContact, newsletterFixture } from '../../services/newsletter/newsletter-fixture'

export function NewsletterBrands() {
  const { show } = useToast()
  const [contact, setContact] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const normalized = toLatinDigits(contact)
    if (!isValidNewsletterContact(normalized)) {
      setError('شماره موبایل (۱۱ رقمی، شروع با ۰۹) یا ایمیل معتبر وارد کنید.')
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      await newsletterFixture.subscribe(normalized)
      show(`کد تخفیف ${formatPersianNumber(NEWSLETTER_DISCOUNT_TOMAN)} تومانی برای شما ارسال شد ✓`)
      setContact('')
    } catch {
      setError('عضویت با خطا مواجه شد. لطفاً دوباره تلاش کنید.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="max-w-[1280px] mx-auto px-4 lg:px-6 mt-6">
      <div className="rounded-[24px] lg:rounded-[28px] bg-gradient-to-l from-[#FF4D00] to-[#ff7a00] p-5 lg:p-7 text-white relative overflow-hidden">
        <div className="absolute -left-10 -top-10 w-40 h-40 rounded-full bg-white/15 blur-2xl" />
        <div className="absolute -right-10 bottom-0 w-60 h-60 rounded-full bg-black/10 blur-3xl" />
        <div className="relative flex flex-col lg:flex-row items-center justify-between gap-6">
          <div className="flex-1">
            <h2 className="font-black text-[18px] lg:text-[20px]">عضو باشگاه استادکاران شوید</h2>
            <p className="text-white/85 text-[13px] mt-1.5 leading-6">کد تخفیف {formatPersianNumber(NEWSLETTER_DISCOUNT_TOMAN)} تومانی + اطلاع از حراج‌های پنهان قبل از همه</p>
          </div>
          <div className="w-full lg:w-auto">
            <form onSubmit={handleSubmit} noValidate className="flex w-full lg:w-[420px] gap-2 bg-white rounded-full p-1.5">
              <input
                aria-label="شماره موبایل یا ایمیل"
                placeholder="شماره موبایل یا ایمیل"
                value={contact}
                onChange={e => { setContact(e.target.value); if (error) setError(null) }}
                className="flex-1 min-w-0 bg-transparent px-5 text-slate-900 placeholder:text-slate-400 text-sm focus:outline-none"
              />
              <button
                type="submit"
                disabled={submitting}
                className="h-10 px-6 rounded-full bg-[#0F172A] text-white font-black text-sm hover:bg-black transition shrink-0 disabled:opacity-60"
              >
                {submitting ? 'در حال ثبت...' : 'دریافت کد'}
              </button>
            </form>
            {error ? (
              <p role="alert" className="mt-2 mr-1 text-[12px] font-bold text-[#3b0a00]">{error}</p>
            ) : (
              <p className="mt-2 mr-1 text-white/75 text-[11px]">با ثبت شماره، کد تخفیف بلافاصله برای شما پیامک می‌شود.</p>
            )}
          </div>
        </div>
      </div>

      <div role="list" aria-label="برندهای موجود" tabIndex={0} className="mt-6 flex items-center gap-3 lg:gap-6 overflow-x-auto scrollbar-none py-2 px-2 rounded-[20px] bg-[#0F172A]">
        {brandsRow.map(b => (
          <div key={b} role="listitem" className="shrink-0 h-14 px-7 rounded-2xl bg-white border border-slate-100 flex items-center justify-center font-black tracking-widest text-slate-500 text-sm">{b}</div>
        ))}
        <span className="shrink-0 text-white/50 text-xs font-bold mr-2">+{formatPersianNumber(TOTAL_BRAND_COUNT - brandsRow.length)} برند دیگر</span>
      </div>
    </section>
  )
}