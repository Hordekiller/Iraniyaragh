import { render, screen } from '@testing-library/react'
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
  it('does not query orders for guests', () => {
    const api = commerceStub()
    renderPage(new MemorySessionStore(), api)
    expect(
      screen.getByRole('heading', { name: 'برای مشاهده سفارش‌ها وارد شوید' }),
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
})
