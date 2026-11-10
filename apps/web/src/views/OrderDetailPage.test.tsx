import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { expect, it, vi } from 'vitest'
import { AuthProvider } from '../state/AuthProvider'
import { OrderProvider } from '../state/OrderProvider'
import { ORDER, commerceStub, signedInStore, testAuthProps, testAuthContext } from '../test/commerce'
import { OrderDetailPage } from './OrderDetailPage'
import { AuthContext, type AuthContextValue } from '../state/auth-context'
import type { CommerceApi } from '../services/commerce/types'
import { AuthApiError } from '../lib/auth/errors'

function sessionPage(auth: AuthContextValue, api: CommerceApi) {
  return <MemoryRouter initialEntries={['/orders/order-1']}><AuthContext.Provider value={auth}><OrderProvider api={api}><Routes><Route path="/orders/:id" element={<OrderDetailPage />} /></Routes></OrderProvider></AuthContext.Provider></MemoryRouter>
}

it('clears a stored delivery address when the active customer changes', async () => {
  const auth = testAuthContext()
  const api = commerceStub({ getOrder: vi.fn().mockResolvedValueOnce(ORDER).mockRejectedValue(new AuthApiError({ code: 'ORDER_NOT_FOUND', statusCode: 404, message: 'not owned' })) })
  const page = render(sessionPage(auth, api))
  await screen.findByText(/خیابان امام خمینی، پلاک ۴۲/)
  page.rerender(sessionPage({ ...auth, identityVersion: auth.identityVersion + 1, state: { ...auth.state, principal: { ...auth.state.principal!, userId: 'other-customer' } } }, api))
  expect(screen.queryByText(/خیابان امام خمینی، پلاک ۴۲/)).not.toBeInTheDocument()
  await screen.findByRole('heading', { name: 'جزئیات سفارش دریافت نشد' })
})

it('cancels only after confirmation and retries an uncertain response with the original key', async () => {
  const cancelOrder = vi.fn().mockRejectedValueOnce(new Error('lost response')).mockResolvedValueOnce({ id: ORDER.id, number: ORDER.number, status: 'CANCELLED', releasedReservations: 1, cancelledAt: ORDER.updatedAt })
  const api = commerceStub({ cancelOrder, getOrder: vi.fn().mockResolvedValueOnce(ORDER).mockResolvedValue({ ...ORDER, status: 'CANCELLED' }) })
  render(sessionPage(testAuthContext(), api))
  fireEvent.click(await screen.findByRole('button', { name: 'لغو سفارش پرداخت‌نشده' }))
  expect(cancelOrder).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'تأیید لغو سفارش' }))
  await screen.findByRole('alert')
  const retry = await screen.findByRole('button', { name: 'تأیید لغو سفارش' })
  await waitFor(() => expect(retry).toBeEnabled())
  fireEvent.click(retry)
  await waitFor(() => expect(screen.queryByRole('region', { name: 'لغو سفارش' })).not.toBeInTheDocument())
  expect(cancelOrder).toHaveBeenCalledTimes(2)
  expect(cancelOrder.mock.calls[1]).toEqual(cancelOrder.mock.calls[0])
  expect(cancelOrder.mock.calls[0]).toEqual([ORDER.id, expect.stringMatching(/^order-cancel-/)])
  await waitFor(() => expect(api.getOrder).toHaveBeenCalledTimes(2))
})

it('does not offer customer cancellation of a paid order', async () => {
  const api = commerceStub({ getOrder: async () => ({ ...ORDER, status: 'PAID' }) })
  render(sessionPage(testAuthContext(), api))
  await screen.findByRole('heading', { name: /سفارش IR-0001/ })
  expect(screen.queryByRole('button', { name: 'لغو سفارش پرداخت‌نشده' })).not.toBeInTheDocument()
  expect(api.cancelOrder).not.toHaveBeenCalled()
})

it('renders immutable order totals, address and server states', async () => {
  const store = signedInStore()
  render(
    <MemoryRouter initialEntries={['/orders/order-1']}>
      <Routes>
        <Route
          path="/orders/:id"
          element={
            <AuthProvider {...testAuthProps(store)}>
              <OrderProvider api={commerceStub()}>
                <OrderDetailPage />
              </OrderProvider>
            </AuthProvider>
          }
        />
      </Routes>
    </MemoryRouter>,
  )
  expect(
    await screen.findByRole('heading', { name: /سفارش IR-0001/ }),
  ).toBeInTheDocument()
  expect(screen.getByText('دریل رونیکس ۲۲۱۰')).toBeInTheDocument()
  expect(screen.getByText(/خیابان امام خمینی، پلاک ۴۲/)).toBeInTheDocument()
  expect(
    screen.getByRole('link', { name: 'بررسی وضعیت پرداخت' }),
  ).toHaveAttribute('href', '/payment/order-1')
})

it('shows real shipment tracking from the owner-scoped order response', async () => {
  render(
    <MemoryRouter initialEntries={['/orders/order-1']}>
      <Routes><Route path="/orders/:id" element={
        <AuthProvider {...testAuthProps(signedInStore())}>
          <OrderProvider api={commerceStub({ getOrder: async () => ({ ...ORDER, shipment: {
            id: 'shipment-1', carrier: 'post', trackingCode: 'PKG-1234', status: 'SHIPPED', dispatchedAt: '2026-09-18T11:00:00Z',
          } }) })}>
            <OrderDetailPage />
          </OrderProvider>
        </AuthProvider>
      } /></Routes>
    </MemoryRouter>,
  )
  expect(await screen.findByText('PKG-1234')).toBeInTheDocument()
  expect(screen.getByText(/حامل:/)).toBeInTheDocument()
})

it('shows confirmed delivery time from the fulfillment timeline', async () => {
  render(
    <MemoryRouter initialEntries={['/orders/order-1']}>
      <Routes><Route path="/orders/:id" element={
        <AuthProvider {...testAuthProps(signedInStore())}>
          <OrderProvider api={commerceStub({ getOrder: async () => ({ ...ORDER,
            fulfillmentStatus: 'DELIVERED',
            shipment: { id: 'shipment-1', carrier: 'post', trackingCode: 'PKG-1234', status: 'DELIVERED', dispatchedAt: '2026-09-18T11:00:00Z' },
            timeline: [...ORDER.timeline, { domain: 'FULFILLMENT', from: 'SHIPPED', to: 'DELIVERED', createdAt: '2026-09-18T12:00:00Z' }],
          }) })}>
            <OrderDetailPage />
          </OrderProvider>
        </AuthProvider>
      } /></Routes>
    </MemoryRouter>,
  )
  expect(await screen.findByText(/تحویل تأیید شد/)).toBeInTheDocument()
  expect(screen.getByText('PKG-1234')).toBeInTheDocument()
})

it('links a paid order to its own published invoice and stays silent when there is none or the lookup fails', async () => {
  const api = commerceStub({ getOrder: async () => ({ ...ORDER, status: 'PAID' }) })
  const summary = { id: 'inv-1', number: 'IRY-2026-000007', orderId: ORDER.id, issuedAt: ORDER.updatedAt, total: { amount: '1000', currency: 'IRR' } }
  const scoped = vi.fn(async () => ({ data: { items: [summary], count: 1, offset: 0, limit: 1 } }))
  const withInvoices = (request: typeof scoped): AuthContextValue => {
    const auth = testAuthContext()
    return { ...auth, request: Object.assign(request, { forCurrentPrincipal: () => request }) as unknown as AuthContextValue['request'] }
  }
  const found = render(sessionPage(withInvoices(scoped), api))
  const link = await screen.findByRole('link', { name: 'مشاهده و دریافت فاکتور' })
  expect(link).toHaveAttribute('href', '/account/invoices/inv-1')
  expect(screen.getByRole('region', { name: 'فاکتور سفارش' })).toHaveTextContent('IRY-2026-000007')
  // The filter narrows the caller's own invoices; no customer or user id is ever sent.
  expect(scoped).toHaveBeenCalledWith(`/api/v1/customers/me/invoices?offset=0&limit=1&orderId=${ORDER.id}`)
  found.unmount()

  // An invoice of another order is never attached to this one.
  const foreign = vi.fn(async () => ({ data: { items: [{ ...summary, orderId: 'other-order' }], count: 1, offset: 0, limit: 1 } }))
  const none = render(sessionPage(withInvoices(foreign), api))
  await screen.findByRole('heading', { name: /سفارش IR-0001/ })
  await waitFor(() => expect(foreign).toHaveBeenCalled())
  expect(screen.queryByRole('link', { name: 'مشاهده و دریافت فاکتور' })).not.toBeInTheDocument()
  none.unmount()

  const failing = vi.fn(async () => { throw new Error('private transport') }) as unknown as typeof scoped
  render(sessionPage(withInvoices(failing), api))
  await screen.findByRole('heading', { name: /سفارش IR-0001/ })
  await waitFor(() => expect(failing).toHaveBeenCalled())
  expect(screen.queryByRole('link', { name: 'مشاهده و دریافت فاکتور' })).not.toBeInTheDocument()
  expect(screen.queryByText('private transport')).not.toBeInTheDocument()
})
