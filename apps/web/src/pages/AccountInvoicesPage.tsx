import { useEffect, useState } from 'react'
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
        فاکتور فروشگاهی، به‌تنهایی نشان‌دهندهٔ پرداخت یا تسویهٔ سفارش نیست.
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
        <>
          <section
            aria-label="مشخصات فاکتور"
            className="rounded-2xl border border-slate-200 bg-white p-5"
          >
            <div className="mb-4">
              <StoreBrandLogo variant="wordmark" />
            </div>
            <h2 className="font-black">{invoice.seller.name}</h2>            <p>{invoice.seller.address}</p>
            <p>{invoice.seller.contact}</p>
            <p className="mt-3">
              شماره: {invoice.number} — {formatTimestamp(invoice.issuedAt)}
            </p>
            <p>خریدار: {invoice.buyerLabel}</p>
            <p>گیرنده: {invoice.address.recipient}</p>
            <p>
              نشانی: {invoice.address.city}، {invoice.address.address} — کد پستی{' '}
              {invoice.address.postalCode}
            </p>
            <p>روش تحویل: {invoice.shippingTitle}</p>
            <Link
              to={ROUTES.order(encodeURIComponent(invoice.orderId))}
              className="mt-3 inline-block font-bold underline"
            >
              مشاهدهٔ سفارش مبنا
            </Link>
          </section>
          <CustomerInvoicePdf invoice={invoice} request={request.forCurrentPrincipal()} />
          <div className="mt-5 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <table className="w-full text-right text-sm">
              <caption className="p-3 font-bold">اقلام فاکتور</caption>
              <thead className="bg-slate-50">
                <tr>
                  {[
                    'کد کالا',
                    'شرح',
                    'تعداد',
                    'قیمت واحد (ریال)',
                    'تخفیف (ریال)',
                    'مالیات (ریال)',
                    'جمع (ریال)',
                  ].map((label) => (
                    <th
                      scope="col"
                      className="whitespace-nowrap p-3"
                      key={label}
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {invoice.lines.map((line, index) => (
                  <tr
                    key={`${index}:${line.sku}`}
                    className="border-t border-slate-100"
                  >
                    <th scope="row" className="p-3">
                      {line.sku}
                    </th>
                    <td className="p-3">{line.title}</td>
                    <td className="p-3">
                      {new Intl.NumberFormat('fa-IR').format(line.quantity)}
                    </td>
                    {[line.unitPrice, line.discount, line.tax, line.total].map(
                      (amount, ordinal) => (
                        <td key={ordinal} className="whitespace-nowrap p-3">
                          {rial(amount.amount)}
                        </td>
                      ),
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <section
            aria-label="مبالغ فاکتور"
            className="mt-5 rounded-2xl border border-slate-200 bg-white p-5"
          >
            <p>جمع اقلام: {rial(invoice.quote.subtotal.amount)}</p>
            <p>تخفیف: {rial(invoice.quote.discount.amount)}</p>
            <p>ارسال: {rial(invoice.quote.shipping.amount)}</p>
            <p>مالیات: {rial(invoice.quote.tax.amount)}</p>
            <p className="mt-2 font-black">
              مبلغ نهایی: {rial(invoice.quote.total.amount)}
            </p>
            <p className="mt-2 text-sm">
              {invoice.taxPolicy.treatment === 'INCLUSIVE'
                ? 'مالیات در مبلغ منظور شده است.'
                : invoice.taxPolicy.treatment === 'EXEMPT'
                  ? `معاف: ${invoice.taxPolicy.exemptionReason}`
                  : 'مالیات جدا از مبلغ پایه است.'}
            </p>
          </section>
        </>
      )}
    </div>
  )
}

/** Private downloadable copy of one published invoice; requests remain bounded
 * and the saved file is verified against the server-stored digest. */
function CustomerInvoicePdf({
  invoice,
  request,
}: {
  invoice: CustomerInvoice
  request: AuthenticatedJsonRequest
}) {
  const [status, setStatus] = useState<InvoicePdfRequestResult>()
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  let active = true
  const pending = new Set<AbortController>()
  useEffect(() => () => {
    active = false
    for (const controller of pending) controller.abort()
  }, [])
  async function run(action: () => Promise<InvoicePdfRequestResult>) {
    if (busy) return
    setBusy(true)
    setError('')
    setMessage('')
    const controller = new AbortController()
    pending.add(controller)
    try {
      const result = await action()
      if (!active) return
      setStatus(result)
      setMessage(result.status === 'READY'
        ? 'پروندهٔ فاکتور آماده است.'
        : 'درخواست ثبت شد؛ کمی بعد وضعیت را بررسی کنید.')
    } catch (cause) {
      if (!active) return
      if (cause instanceof AuthApiError) setError('تنظیمات چاپ در دسترس نیست؛ کمی بعد دوباره امتحان کنید.')
      else setError('درخواست تأیید نشد؛ دوباره تلاش کنید.')
    } finally {
      pending.delete(controller)
      if (active) setBusy(false)
    }
  }
  function handleRequest() {
    const key = crypto.randomUUID()
    void run(() => requestCustomerInvoicePdf(request, invoice.id, key))
  }
  function handleStatus() {
    void run(() => customerInvoicePdfStatus(request, invoice.id))
  }
  async function handleDownload() {
    if (busy || status?.status !== 'READY') return
    setBusy(true)
    setError('')
    setMessage('')
    const controller = new AbortController()
    pending.add(controller)
    try {
      const artifact = await downloadCustomerInvoicePdf(request, invoice.id, invoice.number)
      const digest = await crypto.subtle.digest('SHA-256', artifact.bytes)
      const sha256 = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('')
      if (artifact.serverSha256 && artifact.serverSha256 !== sha256) {
        setError('پروندهٔ دریافت‌شده با هش ثبت‌شده سازگار نیست؛ دوباره بارگیری کنید.')
        return
      }
      const url = URL.createObjectURL(new Blob([artifact.bytes], { type: 'application/pdf' }))
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.rel = 'noopener'
      anchor.download = artifact.filename
      anchor.click()
      URL.revokeObjectURL(url)
      if (active) setMessage('پروندهٔ بررسی‌شده ذخیره شد.')
    } catch (cause) {
      if (!active) return
      setError(cause instanceof AuthApiError
        ? 'پرونده در این لحازه در دسترس نیست؛ کمی بعد دوباره امتحان کنید.'
        : 'بارگیری تأیید نشد؛ دوباره امتحان کنید.')
    } finally {
      pending.delete(controller)
      active = true
      setBusy(false)
    }
  }
  return (
    <section aria-label="پروندهٔ خصوصی فاکتور" className="mt-5 rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="font-black">پروندهٔ خصوصی فاکتور</h2>
      <p className="mt-2 text-sm text-slate-600">
        درخواست یک نسخهٔ فایلِ ذخیره‌شده از همین فاکتور؛ ظرفیت و هش در سرور کنترل می‌شود.
      </p>
      {message && <p role="status" className="mt-3 rounded-xl bg-emerald-50 p-3 text-emerald-800">{message}</p>}
      {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-red-800">{error}</p>}
      <div className="mt-4 flex flex-wrap gap-3">
        <button type="button" className={button} onClick={handleRequest} disabled={busy}>درخواست ساخت پرونده</button>
        <button type="button" className={button} onClick={handleStatus} disabled={busy}>بررسی وضعیت</button>
        <button
          type="button"
          className={`${button} bg-orange-700 text-white`}
          onClick={() => void handleDownload()}
          disabled={busy || status?.status !== 'READY'}
        >
          بارگیری پروندهٔ فاکتور
        </button>
      </div>
      {status && (
        <p className="mt-3 text-sm text-slate-700">
          وضعیت: {status.status === 'READY' ? 'آماده' : 'در انتظار چاپ'}
          {status.status === 'READY' && status.sha256 ? ` — هش ${status.sha256.slice(0, 12)}…` : ''}
          {status.replayed ? '؛ پاسخ تکرارِ درخواست قبلی است.' : ''}
        </p>
      )}
    </section>
  )
}
