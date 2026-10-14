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
    expect(view.container.querySelector('img:not([src="/brand/wordmark-432.webp"])')).toBeNull()
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
})
