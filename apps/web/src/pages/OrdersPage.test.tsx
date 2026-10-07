import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { MemorySessionStore } from '../lib/auth/session-store'
import { AuthProvider } from '../state/AuthProvider'
import { OrderProvider } from '../state/OrderProvider'
import { commerceStub, signedInStore, testAuthProps } from '../test/commerce'
import { OrdersPage } from './OrdersPage'

function renderPage(store = signedInStore(), api = commerceStub()) {
  return render(
    <MemoryRouter>
      <AuthProvider {...testAuthProps(store)}>
        <OrderProvider api={api}>
          <OrdersPage />
        </OrderProvider>
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('OrdersPage', () => {
  it('does not query orders while restoring a guest session or after restore fails', async () => {
    const api = commerceStub()
    renderPage(new MemorySessionStore(), api)
    expect(screen.getByRole('status')).toHaveTextContent('در حال بازیابی نشست')
    expect(api.listOrders).not.toHaveBeenCalled()
    expect(
      await screen.findByRole('heading', { name: 'برای مشاهده سفارش‌ها وارد شوید' }),
    ).toBeInTheDocument()
    expect(api.listOrders).not.toHaveBeenCalled()
  })
  it('lists customer-safe order summaries', async () => {
    renderPage()
    expect(
      await screen.findByRole('link', { name: /سفارش IR-0001/ }),
    ).toHaveAttribute('href', '/orders/order-1')
    expect(screen.getByText('در انتظار پرداخت')).toBeInTheDocument()
  })
  it('shows a recoverable error', async () => {
    renderPage(
      signedInStore(),
      commerceStub({
        listOrders: vi.fn(async () => {
          throw new Error('offline')
        }),
      }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'عملیات انجام نشد',
    )
  })
  it('uses server pagination instead of hiding orders after the first page', async () => {
    const listOrders = vi.fn().mockResolvedValueOnce({ items: [], meta: { page: 1, perPage: 25, total: 26, pages: 2 } })
      .mockResolvedValueOnce({ items: [], meta: { page: 2, perPage: 25, total: 26, pages: 2 } })
    renderPage(signedInStore(), commerceStub({ listOrders }))
    const next = await screen.findByRole('button', { name: 'صفحه بعدی' })
    expect(screen.getByRole('button', { name: 'صفحه قبلی' })).toBeDisabled()
    fireEvent.click(next)
    await waitFor(() => expect(listOrders).toHaveBeenLastCalledWith(2))
    await waitFor(() => expect(screen.getByRole('button', { name: 'صفحه بعدی' })).toBeDisabled())
    expect(listOrders.mock.calls.map(([page]) => page)).toEqual([1, 2])
    expect(screen.getByText(/۲۶ سفارش/)).toBeInTheDocument()
  })

})
