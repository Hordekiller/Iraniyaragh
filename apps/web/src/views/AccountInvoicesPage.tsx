import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type {
  AuthenticatedJsonRequest,
} from '../state/auth-context'
import type {
  CustomerInvoice,
  CustomerInvoiceListResponse,
  InvoicePdfRequestResult,
} from '@iranyaragh/contracts'
import { useAuth } from '../state/auth-context'
import { AuthApiError } from '../lib/auth/errors'
import {
  requestCustomerInvoicePdf,
  customerInvoicePdfStatus,
  downloadCustomerInvoicePdf,
} from '../lib/invoices/invoice-pdf-api'
import {
  AccountNavigation,
  SessionRestoring,
} from '../components/account/AccountNavigation'
import { formatTimestamp } from '../lib/format'
import { ROUTES } from '../lib/routes'
import { StoreBrandLogo } from '../components/brand/StoreBrandLogo'
const rial = (amount: string) =>
  `${new Intl.NumberFormat('fa-IR').format(BigInt(amount))} ریال`
const amountOnly = (amount: string) => new Intl.NumberFormat('fa-IR').format(BigInt(amount))
const button =
  'rounded-xl border border-slate-200 px-4 py-3 font-bold disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-600'
export function AccountInvoicesPage() {
  const { state, restored, open, identityVersion } = useAuth()
  const { id } = useParams<{ id: string }>()
  if (state.phase !== 'authenticated' && (!restored || state.restoring))
    return <SessionRestoring />
  if (state.phase !== 'authenticated')
    return (
      <div className="mx-auto max-w-[720px] px-4 py-20 text-center">
        <h1 className="text-xl font-black">برای مشاهدهٔ فاکتور وارد شوید</h1>
        <button
          type="button"
          onClick={open}
          className="mt-5 rounded-xl bg-slate-950 px-5 py-3 font-bold text-white"
        >
          ورود / ثبت‌نام
        </button>
      </div>
    )
  return (
    <Invoices
      key={`${identityVersion}:${state.principal?.userId}:${id ?? 'list'}`}
      id={id}
    />
  )
}
function Invoices({ id }: { id?: string }) {
  const [offset, setOffset] = useState(0)
  const [retry, setRetry] = useState(0)
  return (
    <InvoiceContent
      key={`${offset}:${retry}`}
      id={id}
      offset={offset}
      onPage={setOffset}
      onReload={() => setRetry((value) => value + 1)}
    />
  )
}
function InvoiceContent({
  id,
  offset,
  onPage,
  onReload,
}: {
  id?: string
  offset: number
  onPage: (offset: number) => void
  onReload: () => void
}) {
  const { request } = useAuth()
  const [invoice, setInvoice] = useState<CustomerInvoice>()
  const [list, setList] = useState<CustomerInvoiceListResponse['data']>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>()
  useEffect(() => {
    let active = true
    const scoped = request.forCurrentPrincipal()
    void (async () => {
      try {
        if (id) {
          const response = await scoped<{ invoice: CustomerInvoice }>(
            `/api/v1/customers/me/invoices/${encodeURIComponent(id)}`,
          )
          if (active) setInvoice(response.data.invoice)
        } else {
          const response = await scoped<CustomerInvoiceListResponse['data']>(
            `/api/v1/customers/me/invoices?offset=${offset}&limit=25`,
          )
          if (active) setList(response.data)
        }
      } catch (cause) {
        if (active) setError(cause)
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [id, offset, request])
  const missing = error instanceof AuthApiError && error.statusCode === 404
  // The customer copy carries no tax column, row or wording. The one exception is a stored total
  // that items, discount and shipping do not explain (a separately added tax): hiding that line
  // would show figures that do not add up. Display decision only; nothing is recalculated.
  const showTax = invoice
    ? invoice.quote.tax.amount !== '0' &&
      BigInt(invoice.quote.subtotal.amount) - BigInt(invoice.quote.discount.amount) + BigInt(invoice.quote.shipping.amount) !==
        BigInt(invoice.quote.total.amount)
    : false
  const showDiscount = invoice
    ? invoice.quote.discount.amount !== '0' || invoice.lines.some((line) => line.discount.amount !== '0')
    : false
  return (
    <div className="mx-auto max-w-[1040px] px-4 py-8 lg:px-6">
      <Link
        to={ROUTES.account}
        className="font-bold text-slate-700 hover:text-orange-700"
      >
        بازگشت به حساب
      </Link>
      <h1 className="mt-4 text-2xl font-black text-slate-950">
        {invoice ? `فاکتور ${invoice.number}` : 'فاکتورهای من'}
      </h1>
      <p className="mt-2 text-sm text-slate-600">
        {invoice ? 'نسخهٔ فاکتور فروش شما؛ می‌توانید فایل PDF آن را هم دریافت کنید.' : 'فاکتور سفارش‌های پرداخت‌شده پس از صدور در این صفحه دیده می‌شود.'}
      </p>
      <AccountNavigation />
      {id && (
        <Link
          to={ROUTES.invoices}
          className="mb-4 inline-block font-bold underline"
        >
          فهرست فاکتورها
        </Link>
      )}
      {loading && <p role="status">در حال دریافت فاکتور…</p>}
      {error !== undefined && (
        <div
          role="alert"
          className="my-4 rounded-xl border border-red-200 bg-red-50 p-4 text-red-800"
        >
          {missing
            ? 'فاکتور قابل مشاهده نیست؛ ممکن است دسترسی آن لغو شده باشد.'
            : 'فاکتور دریافت نشد؛ اتصال و نشست خود را بررسی و دوباره تلاش کنید.'}
        </div>
      )}
      <button
        type="button"
        disabled={loading}
        onClick={onReload}
        className={`${button} mb-4`}
      >
        بازخوانی فاکتور
      </button>
      {!loading && error === undefined && list && (
        <>
          {list.items.length === 0 ? (
            <p className="rounded-2xl border border-slate-200 bg-white p-5">
              در این صفحه فاکتور منتشرشده‌ای ندارید.
            </p>
          ) : (
            <ul className="divide-y rounded-2xl border border-slate-200 bg-white">
              {list.items.map((item) => (
                <li key={item.id} className="p-4">
                  <Link
                    to={ROUTES.invoice(item.id)}
                    className="font-bold underline"
                  >
                    {item.number}
                  </Link>
                  <p className="mt-2 text-sm">
                    {formatTimestamp(item.issuedAt)} — {rial(item.total.amount)}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <nav aria-label="صفحه‌بندی فاکتورها" className="mt-4 flex gap-3">
            <button
              type="button"
              disabled={offset === 0 || loading}
              className={button}
              onClick={() => onPage(Math.max(0, offset - 25))}
            >
              صفحهٔ قبل
            </button>
            <button
              type="button"
              disabled={offset + 25 >= list.count || loading}
              className={button}
              onClick={() => onPage(offset + 25)}
            >
              صفحهٔ بعد
            </button>
          </nav>
        </>
      )}
      {!loading && error === undefined && invoice && (
        <article
          aria-label="فاکتور فروش"
          className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
        >
          <header className="flex flex-wrap items-center justify-between gap-4 border-b-4 border-slate-900 p-5">
            <StoreBrandLogo variant="wordmark" />
            <dl className="min-w-[230px] overflow-hidden rounded-xl border border-slate-200 text-sm">
              <div className="flex border-b border-slate-200">
                <dt className="w-28 bg-slate-100 px-3 py-2 text-slate-600">شمارهٔ فاکتور</dt>
                <dd className="flex-1 px-3 py-2 text-left font-black" dir="ltr">{invoice.number}</dd>
              </div>
              <div className="flex">
                <dt className="w-28 bg-slate-100 px-3 py-2 text-slate-600">تاریخ صدور</dt>
                <dd className="flex-1 px-3 py-2 text-left font-bold">{formatTimestamp(invoice.issuedAt)}</dd>
              </div>
            </dl>
          </header>
          <div className="grid gap-4 p-5 md:grid-cols-2">
            <section aria-label="فروشنده" className="overflow-hidden rounded-xl border border-slate-200">
              <h2 className="bg-slate-900 px-4 py-2 text-sm font-black text-white">فروشنده</h2>
              <div className="space-y-1 p-4 text-sm leading-7">
                <p className="font-black text-slate-950">{invoice.seller.name}</p>
                <p>{invoice.seller.address}</p>
                <p><span className="text-slate-500">تماس:</span> {invoice.seller.contact}</p>
              </div>
            </section>
            <section aria-label="خریدار" className="overflow-hidden rounded-xl border border-slate-200">
              <h2 className="bg-slate-900 px-4 py-2 text-sm font-black text-white">خریدار</h2>
              <div className="space-y-1 p-4 text-sm leading-7">
                <p className="font-black text-slate-950">{invoice.buyerLabel}</p>
                <p>{invoice.address.city}، {invoice.address.address}</p>
                <p><span className="text-slate-500">کد پستی:</span> <bdi dir="ltr">{invoice.address.postalCode}</bdi></p>
                <p><span className="text-slate-500">گیرنده:</span> {invoice.address.recipient}</p>
              </div>
            </section>
          </div>
          <p className="mx-5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm">
            <span className="text-slate-500">روش تحویل:</span> <b>{invoice.shippingTitle}</b>
          </p>
          <div className="mx-5 mt-4 overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[560px] text-right text-sm">
              <caption className="sr-only">اقلام فاکتور</caption>
              <thead className="bg-slate-900 text-white">
                <tr>
                  {[
                    'ردیف',
                    'شرح کالا',
                    'تعداد',
                    'قیمت واحد (ریال)',
                    ...(showDiscount ? ['تخفیف (ریال)'] : []),
                    ...(showTax ? ['مالیات (ریال)'] : []),
                    'مبلغ کل (ریال)',
                  ].map((label) => (
                    <th scope="col" className="whitespace-nowrap px-3 py-2.5 text-center text-xs font-bold" key={label}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {invoice.lines.map((line, index) => (
                  <tr key={`${index}:${line.sku}`} className="border-t border-slate-200 even:bg-slate-50">
                    <td className="px-3 py-2.5 text-center">{new Intl.NumberFormat('fa-IR').format(index + 1)}</td>
                    <th scope="row" className="px-3 py-2.5 text-right font-bold">
                      {line.title}
                      <span className="block text-xs font-normal text-slate-500">
                        کد کالا: <bdi dir="ltr">{line.sku}</bdi>
                      </span>
                    </th>
                    <td className="px-3 py-2.5 text-center">{new Intl.NumberFormat('fa-IR').format(line.quantity)}</td>
                    {[line.unitPrice, ...(showDiscount ? [line.discount] : []), ...(showTax ? [line.tax] : []), line.total].map(
                      (amount, ordinal, cells) => (
                        <td key={ordinal} className={`whitespace-nowrap px-3 py-2.5 text-center ${ordinal === cells.length - 1 ? 'font-black' : ''}`}>
                          {amountOnly(amount.amount)}
                        </td>
                      ),
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-start justify-between gap-5 p-5">
            <p className="max-w-md text-xs leading-6 text-slate-500">
              مبالغ این فاکتور به ریال است. این سند از اطلاعات ثبت‌شدهٔ زمان صدور تهیه شده و رسید پرداخت نیست.
            </p>
            <dl aria-label="مبالغ فاکتور" className="w-full max-w-sm overflow-hidden rounded-xl border border-slate-200 text-sm">
              <div className="flex justify-between border-b border-slate-200 px-4 py-2">
                <dt className="text-slate-600">جمع اقلام</dt><dd className="font-bold">{rial(invoice.quote.subtotal.amount)}</dd>
              </div>
              {showDiscount && (
                <div className="flex justify-between border-b border-slate-200 px-4 py-2">
                  <dt className="text-slate-600">تخفیف</dt><dd className="font-bold">{rial(invoice.quote.discount.amount)}</dd>
                </div>
              )}
              <div className="flex justify-between border-b border-slate-200 px-4 py-2">
                <dt className="text-slate-600">هزینهٔ ارسال</dt><dd className="font-bold">{rial(invoice.quote.shipping.amount)}</dd>
              </div>
              {showTax && (
                <div className="flex justify-between border-b border-slate-200 px-4 py-2">
                  <dt className="text-slate-600">مالیات</dt><dd className="font-bold">{rial(invoice.quote.tax.amount)}</dd>
                </div>
              )}
              <div className="flex justify-between bg-slate-900 px-4 py-3 text-base font-black text-white">
                <dt>مبلغ نهایی</dt><dd>{rial(invoice.quote.total.amount)}</dd>
              </div>
            </dl>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 p-5">
            <Link to={ROUTES.order(encodeURIComponent(invoice.orderId))} className="font-bold underline">
              مشاهدهٔ سفارش این فاکتور
            </Link>
            <CustomerInvoicePdf invoice={invoice} request={request.forCurrentPrincipal()} />
          </div>
        </article>
      )}
    </div>
  )
}

const PDF_POLL_INTERVAL_MS = 2000
const PDF_POLL_ATTEMPTS = 20

/**
 * One action for the customer: ask the server for the stored PDF of this
 * invoice, wait for it to be rendered, verify it against the server digest and
 * save it. Waiting is bounded; nothing here reports a file that was not received.
 */
function CustomerInvoicePdf({
  invoice,
  request,
}: {
  invoice: CustomerInvoice
  request: AuthenticatedJsonRequest
}) {
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const activeRef = useRef(true)
  // One key per requested file: repeating the click while it renders asks for the same file.
  const keyRef = useRef<string | null>(null)
  useEffect(() => {
    activeRef.current = true
    return () => { activeRef.current = false }
  }, [])
  async function handleDownload() {
    if (busy) return
    setBusy(true)
    setError('')
    setMessage('در حال آماده‌سازی فایل فاکتور…')
    try {
      keyRef.current ??= crypto.randomUUID()
      let status: InvoicePdfRequestResult = await requestCustomerInvoicePdf(request, invoice.id, keyRef.current)
      for (let attempt = 0; status.status !== 'READY' && attempt < PDF_POLL_ATTEMPTS; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, PDF_POLL_INTERVAL_MS))
        if (!activeRef.current) return
        status = await customerInvoicePdfStatus(request, invoice.id)
      }
      if (!activeRef.current) return
      if (status.status !== 'READY') {
        setMessage('')
        setError('فایل فاکتور هنوز آماده نشده است؛ چند لحظهٔ دیگر دوباره همین دکمه را بزنید.')
        return
      }
      const artifact = await downloadCustomerInvoicePdf(request, invoice.id, invoice.number)
      const digest = await crypto.subtle.digest('SHA-256', artifact.bytes)
      const sha256 = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('')
      if (!activeRef.current) return
      if (artifact.serverSha256 && artifact.serverSha256 !== sha256) {
        setMessage('')
        setError('فایل دریافت‌شده کامل نیست؛ دوباره تلاش کنید.')
        return
      }
      const url = URL.createObjectURL(new Blob([artifact.bytes], { type: 'application/pdf' }))
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.rel = 'noopener'
      anchor.download = artifact.filename
      anchor.click()
      URL.revokeObjectURL(url)
      keyRef.current = null
      setMessage('فایل فاکتور دریافت شد.')
    } catch (cause) {
      if (!activeRef.current) return
      setMessage('')
      setError(cause instanceof AuthApiError
        ? 'دریافت فایل فاکتور در این لحظه ممکن نیست؛ کمی بعد دوباره تلاش کنید.'
        : 'دریافت فایل تأیید نشد؛ اتصال را بررسی و دوباره تلاش کنید.')
    } finally {
      if (activeRef.current) setBusy(false)
    }
  }
  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        className="rounded-xl bg-orange-700 px-5 py-3 font-bold text-white disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-600 focus-visible:ring-offset-2"
        onClick={() => void handleDownload()}
        disabled={busy}
      >
        {busy ? 'در حال آماده‌سازی…' : 'دریافت فایل فاکتور (PDF)'}
      </button>
      {message && <p role="status" className="text-sm text-emerald-800">{message}</p>}
      {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
    </div>
  )
}
