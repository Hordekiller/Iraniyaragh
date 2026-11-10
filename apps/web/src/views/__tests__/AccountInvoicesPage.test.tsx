import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AccountInvoicesPage } from '../AccountInvoicesPage'
import { AuthApiError } from '../../lib/auth/errors'
import { SITE_NAME } from '../../lib/site-config'
const auth = vi.hoisted(() => ({
  request: vi.fn(),
  open: vi.fn(),
  identityVersion: 1,
  restored: true,
  state: {
    phase: 'authenticated',
    restoring: false,
    principal: { userId: 'customer-a' },
  },
}))
vi.mock('../../state/auth-context', () => ({
  useAuth: () => ({
    ...auth,
    request: Object.assign(auth.request, {
      forCurrentPrincipal: () => auth.request,
    }),
  }),
}))
const money = (amount: string) => ({ amount, currency: 'IRR' })
const invoice = {
  id: 'doc-a',
  number: 'IRY-2026-000001',
  orderId: 'order-a',
  issuedAt: '2026-10-13T12:00:00Z',
  seller: {
    name: 'فروشگاه ثبت‌شده',
    address: 'نشانی عمومی فروشنده',
    contact: 'تماس عمومی',
  },
  buyerLabel: 'خریدار سند',
  address: {
    city: 'تهران',
    address: 'نشانی صورتحساب',
    postalCode: '1234567890',
    recipient: 'گیرنده',
  },
  shippingTitle: 'تحویل حضوری',
  taxPolicy: { treatment: 'INCLUSIVE' },
  quote: {
    subtotal: money('9007199254740993'),
    discount: money('0'),
    shipping: money('0'),
    tax: money('0'),
    total: money('9007199254740993'),
  },
  lines: [
    {
      sku: 'SKU-A',
      title: '<img onerror="unsafe()">',
      quantity: 1,
      unitPrice: money('9007199254740993'),
      discount: money('0'),
      tax: money('0'),
      total: money('9007199254740993'),
    },
  ],
}
const list = {
  items: [
    {
      id: invoice.id,
      number: invoice.number,
      orderId: invoice.orderId,
      issuedAt: invoice.issuedAt,
      total: invoice.quote.total,
    },
  ],
  count: 1,
  offset: 0,
  limit: 25,
}
const component = (path = '/account/invoices') => (
  <MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route path="/account/invoices" element={<AccountInvoicesPage />} />
      <Route path="/account/invoices/:id" element={<AccountInvoicesPage />} />
    </Routes>
  </MemoryRouter>
)
afterEach(() => {
  vi.resetAllMocks()
  auth.identityVersion = 1
  auth.restored = true
  auth.state.phase = 'authenticated'
  auth.state.restoring = false
  auth.state.principal.userId = 'customer-a'
})
describe('Customer invoice ownership UI and session lifetime', () => {
  it('requires login before any private list or detail request', () => {
    auth.state.phase = 'anonymous'
    render(component('/account/invoices/doc-a'))
    expect(screen.getByText('برای مشاهدهٔ فاکتور وارد شوید')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'ورود / ثبت‌نام' }))
    expect(auth.open).toHaveBeenCalledOnce()
    expect(auth.request).not.toHaveBeenCalled()
  })
  it('waits for silent session restoration before private reads', () => {
    auth.state.phase = 'anonymous'
    auth.restored = false
    render(component())
    expect(screen.getByRole('status')).toHaveTextContent('در حال بازیابی نشست')
    expect(auth.request).not.toHaveBeenCalled()
  })
  it('lists only the customer-self contract with opaque authenticated links', async () => {
    auth.request.mockResolvedValue({ data: list })
    render(component())
    const link = await screen.findByRole('link', { name: invoice.number })
    expect(link).toHaveAttribute('href', '/account/invoices/doc-a')
    expect(auth.request).toHaveBeenCalledWith(
      '/api/v1/customers/me/invoices?offset=0&limit=25',
    )
    expect(screen.getByText(/۹٬۰۰۷٬۱۹۹٬۲۵۴٬۷۴۰٬۹۹۳/)).toBeVisible()
  })
  it('renders server totals and escaped stored text, with no invented paid state or mutation', async () => {
    auth.request.mockResolvedValue({ data: { invoice } })
    const view = render(component('/account/invoices/doc-a'))
    await screen.findByRole('heading', { name: `فاکتور ${invoice.number}` })
    expect(
      screen.getByRole('table', { name: 'اقلام فاکتور' }),
    ).toHaveTextContent('۹٬۰۰۷٬۱۹۹٬۲۵۴٬۷۴۰٬۹۹۳')
    expect(screen.getByText('<img onerror="unsafe()">')).toBeVisible()
    expect(screen.getByRole('img', { name: SITE_NAME })).toBeVisible()
    expect(view.container.querySelector('img:not([src="/brand/wordmark-432.webp?v=20261104"])')).toBeNull()
    expect(auth.request).toHaveBeenCalledWith(
      '/api/v1/customers/me/invoices/doc-a',
    )
    expect(
      screen.queryByRole('button', { name: /پرداخت|انتشار|ویرایش/ }),
    ).not.toBeInTheDocument()
  })
  it('shows a genuine empty list without a fake invoice', async () => {
    auth.request.mockResolvedValue({
      data: { items: [], count: 0, offset: 0, limit: 25 },
    })
    render(component())
    await screen.findByText('در این صفحه فاکتور منتشرشده‌ای ندارید.')
    expect(
      screen.queryByRole('link', { name: invoice.number }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'صفحهٔ بعد' })).toBeDisabled()
  })
  it('retries a failed network read without exposing raw diagnostics', async () => {
    auth.request
      .mockRejectedValueOnce(new Error('private transport'))
      .mockResolvedValueOnce({ data: list })
    render(component())
    await screen.findByRole('alert')
    expect(screen.queryByText('private transport')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'بازخوانی فاکتور' }))
    await screen.findByRole('link', { name: invoice.number })
    expect(auth.request).toHaveBeenCalledTimes(2)
  })
  it('hidden/foreign/revoked documents use one safe unavailable state', async () => {
    auth.request.mockRejectedValue(
      new AuthApiError({
        code: 'INVOICE_DOCUMENT_NOT_FOUND',
        message: 'private ownership detail',
        statusCode: 404,
      }),
    )
    render(component('/account/invoices/doc-a'))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'فاکتور قابل مشاهده نیست',
    )
    expect(
      screen.queryByText('private ownership detail'),
    ).not.toBeInTheDocument()
  })
  it('pages with bounded offset and never a customer or user id parameter', async () => {
    auth.request
      .mockResolvedValueOnce({ data: { ...list, count: 26 } })
      .mockResolvedValueOnce({
        data: { items: [], count: 26, offset: 25, limit: 25 },
      })
    render(component())
    await screen.findByRole('link', { name: invoice.number })
    fireEvent.click(screen.getByRole('button', { name: 'صفحهٔ بعد' }))
    await waitFor(() =>
      expect(auth.request).toHaveBeenLastCalledWith(
        '/api/v1/customers/me/invoices?offset=25&limit=25',
      ),
    )
    await screen.findByText('در این صفحه فاکتور منتشرشده‌ای ندارید.')
  })
  it('drops late data from a previous customer after principal change', async () => {
    let release!: (value: unknown) => void
    auth.request.mockReturnValueOnce(
      new Promise((resolve) => {
        release = resolve
      }),
    )
    const view = render(component())
    await waitFor(() => expect(auth.request).toHaveBeenCalledOnce())
    auth.identityVersion = 2
    auth.state.principal.userId = 'customer-b'
    auth.request.mockResolvedValue({
      data: { items: [], count: 0, offset: 0, limit: 25 },
    })
    view.rerender(component())
    await screen.findByText('در این صفحه فاکتور منتشرشده‌ای ندارید.')
    await act(async () => release({ data: list }))
    expect(
      screen.queryByRole('link', { name: invoice.number }),
    ).not.toBeInTheDocument()
  })
  it('never shows tax to the customer when items, discount and shipping explain the total', async () => {
    const inclusive = { ...invoice, taxPolicy: { treatment: 'INCLUSIVE' }, quote: { ...invoice.quote, tax: money('743713699842284') },
      lines: [{ ...invoice.lines[0], tax: money('743713699842284') }] }
    const exempt = { ...invoice, taxPolicy: { treatment: 'EXEMPT', exemptionReason: 'دلیل داخلی معافیت' } }
    for (const stored of [invoice, inclusive, exempt]) {
      auth.request.mockResolvedValue({ data: { invoice: stored } })
      const view = render(component('/account/invoices/doc-a'))
      await screen.findByRole('heading', { name: `فاکتور ${invoice.number}` })
      expect(view.container).not.toHaveTextContent('مالیات')
      expect(view.container).not.toHaveTextContent('معاف')
      expect(view.container).not.toHaveTextContent('دلیل داخلی معافیت')
      expect(view.container).not.toHaveTextContent('۷۴۳٬۷۱۳٬۶۹۹٬۸۴۲٬۲۸۴')
      expect(screen.getByRole('table', { name: 'اقلام فاکتور' })).toHaveTextContent('۹٬۰۰۷٬۱۹۹٬۲۵۴٬۷۴۰٬۹۹۳')
      expect(screen.getByLabelText('مبالغ فاکتور')).toHaveTextContent('مبلغ نهایی')
      view.unmount()
    }
  })
  it('keeps the tax line only when the stored total cannot be explained without it', async () => {
    const added = { ...invoice, taxPolicy: { treatment: 'EXCLUSIVE' },
      quote: { subtotal: money('1000'), discount: money('0'), shipping: money('0'), tax: money('90'), total: money('1090') } }
    auth.request.mockResolvedValue({ data: { invoice: added } })
    render(component('/account/invoices/doc-a'))
    await screen.findByRole('heading', { name: `فاکتور ${invoice.number}` })
    expect(screen.getByRole('columnheader', { name: 'مالیات (ریال)' })).toBeVisible()
    expect(screen.getByLabelText('مبالغ فاکتور')).toHaveTextContent('مالیات')
  })
  it('shows the discount column and row only when a discount exists', async () => {
    auth.request.mockResolvedValue({ data: { invoice } })
    const plain = render(component('/account/invoices/doc-a'))
    await screen.findByRole('heading', { name: `فاکتور ${invoice.number}` })
    expect(plain.container).not.toHaveTextContent('تخفیف')
    plain.unmount()
    const discounted = { ...invoice, quote: { ...invoice.quote, subtotal: money('1000'), discount: money('100'), total: money('900') } }
    auth.request.mockResolvedValue({ data: { invoice: discounted } })
    render(component('/account/invoices/doc-a'))
    await screen.findByRole('heading', { name: `فاکتور ${invoice.number}` })
    expect(screen.getByRole('columnheader', { name: 'تخفیف (ریال)' })).toBeVisible()
  })
  it('downloads the stored PDF with one action: request, wait until ready, verify, save', async () => {
    const bytes = new TextEncoder().encode('%PDF-1.7 test')
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), value => value.toString(16).padStart(2, '0')).join('')
    const pending = { data: { pdf: { documentId: 'doc-a', status: 'PENDING', sha256: null, byteCount: null, replayed: false } } }
    const ready = { data: { pdf: { documentId: 'doc-a', status: 'READY', sha256: digest, byteCount: bytes.byteLength, replayed: false } } }
    const artifact = vi.fn(async () => new Response(bytes, { headers: { 'Content-Disposition': 'attachment; filename="iranyaragh-invoice-IRY-2026-000001.pdf"', 'X-Content-SHA256': digest } }))
    Object.assign(auth.request, { response: artifact })
    auth.request.mockImplementation(async (path: string, init?: { method?: string }) => {
      if (path.endsWith('/pdf')) return init?.method === 'POST' ? pending : ready
      return { data: { invoice } }
    })
    const createObjectURL = vi.fn(() => 'blob:invoice'); const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL }))
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    render(component('/account/invoices/doc-a'))
    fireEvent.click(await screen.findByRole('button', { name: 'دریافت فایل فاکتور (PDF)' }))
    expect(await screen.findByText('فایل فاکتور دریافت شد.', undefined, { timeout: 8000 })).toBeVisible()
    const post = auth.request.mock.calls.find(([path, init]) => path === '/api/v1/customers/me/invoices/doc-a/pdf' && init?.method === 'POST')
    expect(post?.[1].headers['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/u)
    expect(artifact).toHaveBeenCalledWith('/api/v1/customers/me/invoices/doc-a/pdf/artifact')
    expect(createObjectURL).toHaveBeenCalledOnce()
    expect(click).toHaveBeenCalledOnce()
    click.mockRestore()
  }, 15000)
  it('reports a failed PDF request without claiming a file', async () => {
    auth.request.mockImplementation(async (path: string) => {
      if (path.endsWith('/pdf')) throw new AuthApiError({ code: 'INVOICE_PDF_DISABLED', message: 'private capacity detail', statusCode: 409 })
      return { data: { invoice } }
    })
    render(component('/account/invoices/doc-a'))
    fireEvent.click(await screen.findByRole('button', { name: 'دریافت فایل فاکتور (PDF)' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('دریافت فایل فاکتور در این لحظه ممکن نیست')
    expect(screen.queryByText('private capacity detail')).not.toBeInTheDocument()
    expect(screen.queryByText('فایل فاکتور دریافت شد.')).not.toBeInTheDocument()
  })
})
