import { useCallback, useEffect, useState } from 'react'
import { Star } from 'lucide-react'
import type { OwnReview, PublicReviewList, ReviewEligibility, ReviewSort } from '@iranyaragh/contracts'
import { useAuth } from '../../state/auth-context'
import { AuthApiError } from '../../lib/auth/errors'
import { toPersianDigits } from '../../lib/format'

const BODY_MIN = 10
const BODY_MAX = 2000
const TITLE_MAX = 100
const SORTS: Array<{ value: ReviewSort; label: string }> = [{ value: 'newest', label: 'جدیدترین' }, { value: 'highest', label: 'بیشترین امتیاز' }, { value: 'lowest', label: 'کمترین امتیاز' }]
const STATUS_TEXT: Record<OwnReview['status'], string> = {
  PENDING: 'نظر شما ثبت شد و پس از بررسی تیم فروشگاه نمایش داده می‌شود.',
  APPROVED: 'نظر شما منتشر شده است. با ویرایش، دوباره برای بررسی ارسال می‌شود.',
  REJECTED: 'نظر شما منتشر نشد.',
  HIDDEN: 'نظر شما توسط تیم فروشگاه از نمایش خارج شده است.',
}
const date = new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeZone: 'Asia/Tehran' })

function Stars({ value, size = 16 }: { value: number; size?: number }) {
  return <span className="inline-flex" aria-hidden="true">{[1, 2, 3, 4, 5].map(n => <Star key={n} size={size} className={n <= Math.round(value) ? 'fill-amber-400 text-amber-400' : 'fill-slate-200 text-slate-200'} />)}</span>
}

function errorText(error: unknown): string {
  if (error instanceof AuthApiError) {
    const code = String(error.code)
    if (code === 'REVIEW_NOT_ELIGIBLE') return 'فقط خریدارانی که سفارششان تحویل شده است می‌توانند برای این کالا نظر بدهند.'
    if (code === 'ALREADY_REVIEWED') return 'شما قبلاً برای این کالا نظر ثبت کرده‌اید.'
    if (code === 'STALE_VERSION') return 'نظر شما در این فاصله تغییر کرده است؛ صفحه را دوباره باز کنید.'
    if (code === 'VALIDATION_ERROR' && error.message) return error.message
  }
  return 'ثبت نظر تأیید نشد؛ اتصال را بررسی و دوباره تلاش کنید. تا زمان تأیید، نظر ثبت‌شده فرض نشود.'
}

export function ProductReviews({ slug, initial }: { slug: string; initial: PublicReviewList | null }) {
  const { state, restored, open, identityVersion } = useAuth()
  const [list, setList] = useState<PublicReviewList | null>(initial)
  const [sort, setSort] = useState<ReviewSort>('newest')
  const [loading, setLoading] = useState(!initial)
  const [loadFailed, setLoadFailed] = useState(false)
  const authenticated = state.phase === 'authenticated'

  const fetchPage = useCallback(async (page: number, order: ReviewSort) => {
    const response = await fetch(`/api/v1/reviews/products/${encodeURIComponent(slug)}?page=${page}&sort=${order}`, { headers: { Accept: 'application/json' } })
    // Release the connection: an unread error body leaves the request open for the browser.
    if (!response.ok) { await response.body?.cancel().catch(() => undefined); throw new Error('reviews') }
    return ((await response.json()) as { data: PublicReviewList }).data
  }, [slug])

  // The server render may be absent (best-effort); load client-side so a transient outage heals.
  useEffect(() => {
    if (initial) return
    let current = true
    fetchPage(1, 'newest').then(data => { if (current) setList(data) }).catch(() => { if (current) setLoadFailed(true) }).finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [fetchPage, initial])

  async function changeSort(next: ReviewSort) {
    setSort(next); setLoading(true); setLoadFailed(false)
    try { setList(await fetchPage(1, next)) } catch { setLoadFailed(true) } finally { setLoading(false) }
  }
  async function more() {
    if (!list) return
    setLoading(true); setLoadFailed(false)
    try {
      const next = await fetchPage(list.meta.page + 1, sort)
      setList({ ...next, items: [...list.items, ...next.items] })
    } catch { setLoadFailed(true) } finally { setLoading(false) }
  }

  const summary = list?.summary
  return (
    <section aria-labelledby="product-reviews-heading" id="reviews" className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 lg:p-8">
      <h2 id="product-reviews-heading" className="text-lg font-black text-slate-900">نظر خریداران</h2>
      {summary && summary.count > 0 && summary.average !== null ? (
        <div className="mt-4 grid gap-6 sm:grid-cols-[auto_1fr] sm:items-center">
          <div className="text-center">
            <p className="text-4xl font-black text-slate-900">{toPersianDigits(summary.average)}</p>
            <Stars value={summary.average} size={18} />
            <p className="mt-1 text-xs text-slate-600">از {toPersianDigits(summary.count)} نظر</p>
          </div>
          <ul className="space-y-1.5" aria-label="توزیع امتیازها">
            {[5, 4, 3, 2, 1].map(n => {
              const count = summary.counts[n - 1] ?? 0
              return <li key={n} className="flex items-center gap-2 text-xs text-slate-700">
                <span className="w-14 shrink-0">{toPersianDigits(n)} ستاره</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100"><span className="block h-full rounded-full bg-amber-400" style={{ width: `${(count / summary.count) * 100}%` }} /></span>
                <span className="w-8 shrink-0 text-left">{toPersianDigits(count)}</span>
              </li>
            })}
          </ul>
        </div>
      ) : !loading && !loadFailed ? <p className="mt-3 text-sm text-slate-600">هنوز نظری برای این کالا ثبت نشده است.</p> : null}

      <div className="mt-6 border-t border-slate-100 pt-5">
        {!restored && !authenticated ? <p role="status" className="text-sm text-slate-600">در حال بررسی نشست…</p>
          : !authenticated ? <div className="flex flex-wrap items-center gap-3"><p className="text-sm text-slate-700">خریداران این کالا می‌توانند نظر خود را ثبت کنند.</p><button type="button" onClick={open} className="rounded-xl border-2 border-slate-900 px-4 py-2 text-sm font-black hover:bg-slate-900 hover:text-white">ورود و ثبت نظر</button></div>
            : <ReviewComposer key={`${identityVersion}:${state.principal?.userId}`} slug={slug} />}
      </div>

      {loadFailed && <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">دریافت نظرها ناموفق بود. <button type="button" className="font-bold underline" onClick={() => void (list ? more() : changeSort(sort))}>تلاش دوباره</button></p>}
      {list && list.items.length > 0 && (
        <div className="mt-6">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-black text-slate-900">نظرها ({toPersianDigits(list.meta.total)})</h3>
            <label className="flex items-center gap-2 text-xs text-slate-600">مرتب‌سازی
              <select value={sort} onChange={event => void changeSort(event.target.value as ReviewSort)} className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs">
                {SORTS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
          </div>
          <ul className="mt-3 divide-y divide-slate-100" aria-busy={loading}>
            {list.items.map(review => (
              <li key={review.id} className="py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span role="img" aria-label={`${toPersianDigits(review.rating)} از ۵ ستاره`}><Stars value={review.rating} /></span>
                  {review.title && <strong className="text-sm text-slate-900">{review.title}</strong>}
                </div>
                <p className="mt-1 text-xs text-slate-600">{review.authorName} · <span className="font-bold text-emerald-800">خریدار این کالا</span> · <time dateTime={review.publishedAt}>{date.format(new Date(review.publishedAt))}</time></p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-800">{review.body}</p>
                {review.staffReply && <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm leading-7 text-slate-800"><p className="text-xs font-black text-slate-700">پاسخ فروشگاه</p><p className="mt-1 whitespace-pre-wrap">{review.staffReply}</p></div>}
              </li>
            ))}
          </ul>
          {list.meta.page < list.meta.pages && <button type="button" disabled={loading} onClick={() => void more()} className="mt-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold disabled:opacity-50">{loading ? 'در حال دریافت…' : 'نمایش نظرهای بیشتر'}</button>}
        </div>
      )}
    </section>
  )
}

function ReviewComposer({ slug }: { slug: string }) {
  const { request } = useAuth()
  const [eligibility, setEligibility] = useState<ReviewEligibility | null>(null)
  const [failed, setFailed] = useState(false)
  const [editing, setEditing] = useState(false)
  const [rating, setRating] = useState(0)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // One key per unchanged draft: a retry after a lost response replays instead of duplicating.
  const [key, setKey] = useState(() => `review-${globalThis.crypto.randomUUID()}`)

  useEffect(() => {
    let current = true
    const scoped = request.forCurrentPrincipal()
    void scoped<ReviewEligibility>(`/api/v1/reviews/products/${encodeURIComponent(slug)}/me`).then(result => { if (current) setEligibility(result.data) }).catch(() => { if (current) setFailed(true) })
    return () => { current = false }
  }, [request, slug])

  function edit(review: OwnReview | null) {
    setRating(review?.rating ?? 0); setTitle(review?.title ?? ''); setBody(review?.body ?? ''); setError(null); setEditing(true)
    setKey(`review-${globalThis.crypto.randomUUID()}`)
  }
  const dirty = (apply: () => void) => { apply(); setKey(`review-${globalThis.crypto.randomUUID()}`) }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!eligibility) return
    if (rating < 1) return setError('امتیاز خود را انتخاب کنید.')
    if (body.trim().length < BODY_MIN) return setError(`متن نظر دست‌کم ${toPersianDigits(BODY_MIN)} نویسه باشد.`)
    setBusy(true); setError(null)
    const scoped = request.forCurrentPrincipal()
    const payload = { rating, title: title.trim() || null, body: body.trim() }
    try {
      const own = eligibility.review
      const result = own
        ? await scoped<{ review: OwnReview }>(`/api/v1/reviews/mine/${encodeURIComponent(own.id)}`, { method: 'PUT', json: { ...payload, expectedVersion: own.version }, headers: { 'Idempotency-Key': key } })
        : await scoped<{ review: OwnReview }>(`/api/v1/reviews/products/${encodeURIComponent(slug)}`, { method: 'POST', json: payload, headers: { 'Idempotency-Key': key } })
      setEligibility({ canReview: false, reason: 'ALREADY_REVIEWED', review: result.data.review }); setEditing(false)
    } catch (cause) { setError(errorText(cause)) } finally { setBusy(false) }
  }

  if (failed) return <p role="alert" className="text-sm text-red-800">وضعیت امکان ثبت نظر دریافت نشد؛ صفحه را دوباره بارگذاری کنید.</p>
  if (!eligibility) return <p role="status" className="text-sm text-slate-600">در حال بررسی…</p>
  if (!editing) {
    const own = eligibility.review
    if (own) return <div className="rounded-xl bg-slate-50 p-4 text-sm leading-7" data-testid="own-review">
      <p className="font-black text-slate-900">نظر شما <span aria-hidden="true">·</span> <span className="font-normal">{toPersianDigits(own.rating)} از ۵</span></p>
      <p className="text-slate-700">{STATUS_TEXT[own.status]}</p>
      {own.moderationNote && <p className="text-slate-800">دلیل: {own.moderationNote}</p>}
      {own.status !== 'HIDDEN' && <button type="button" onClick={() => edit(own)} className="mt-2 font-bold underline">ویرایش نظر</button>}
    </div>
    if (!eligibility.canReview) return <p className="text-sm text-slate-700">ثبت نظر برای خریدارانی است که این کالا را سفارش داده و تحویل گرفته‌اند.</p>
    return <button type="button" onClick={() => edit(null)} className="rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-black text-white">ثبت نظر شما</button>
  }
  return (
    <form noValidate onSubmit={event => void submit(event)} className="space-y-3" aria-label="ثبت نظر">
      <fieldset>
        <legend className="text-sm font-black text-slate-900">امتیاز شما</legend>
        <div className="mt-1 flex gap-1" role="radiogroup" aria-label="امتیاز از ۱ تا ۵">
          {[1, 2, 3, 4, 5].map(n => <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${toPersianDigits(n)} ستاره`} onClick={() => dirty(() => setRating(n))} className="rounded p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"><Star size={26} className={n <= rating ? 'fill-amber-400 text-amber-400' : 'fill-slate-200 text-slate-300'} /></button>)}
        </div>
      </fieldset>
      <label className="block text-sm font-bold text-slate-900">عنوان (اختیاری)
        <input value={title} maxLength={TITLE_MAX} onChange={event => dirty(() => setTitle(event.target.value))} className="mt-1 block w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-normal" />
      </label>
      <label className="block text-sm font-bold text-slate-900">متن نظر
        <textarea value={body} maxLength={BODY_MAX} rows={5} onChange={event => dirty(() => setBody(event.target.value))} aria-describedby="review-hint" className="mt-1 block w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-normal leading-7" />
      </label>
      <p id="review-hint" className="text-xs text-slate-600">تجربهٔ خود را از کیفیت، نصب و کارکرد کالا بنویسید. لینک، ایمیل و شمارهٔ تماس مجاز نیست. نظر پس از بررسی منتشر می‌شود. ({toPersianDigits(body.length)}/{toPersianDigits(BODY_MAX)})</p>
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-black text-white disabled:opacity-50">{busy ? 'در حال ثبت…' : eligibility.review ? 'ذخیرهٔ ویرایش' : 'ارسال نظر'}</button>
        <button type="button" disabled={busy} onClick={() => setEditing(false)} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-bold">انصراف</button>
      </div>
    </form>
  )
}
