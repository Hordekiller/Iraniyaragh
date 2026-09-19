import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { AuthProvider } from '../state/AuthProvider'
import { OrderProvider } from '../state/OrderProvider'
import {
  ORDER,
  commerceStub,
  signedInStore,
  testAuthProps,
} from '../test/commerce'
import { PaymentPage } from './PaymentPage'

function renderPage(order = ORDER) {
  const store = signedInStore()
  return render(
    <MemoryRouter initialEntries={['/payment/order-1']}>
      <Routes>
        <Route
          path="/payment/:id"
          element={
            <AuthProvider {...testAuthProps(store)}>
              <OrderProvider
                api={commerceStub({ getOrder: async () => order })}
              >
                <PaymentPage />
              </OrderProvider>
            </AuthProvider>
          }
        />
      </Routes>
    </MemoryRouter>,
  )
}

describe('PaymentPage', () => {
  it('never exposes a fake payment action when no gateway API exists', async () => {
    renderPage()
    expect(
      await screen.findByRole('heading', {
        name: 'سفارش در انتظار پرداخت است',
      }),
    ).toBeInTheDocument()
    expect(screen.getByText(/هیچ پرداختی موفق فرض نمی‌شود/)).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /پرداخت موفق/ }),
    ).not.toBeInTheDocument()
  })
  it('shows success only when both server order and payment are paid', async () => {
    renderPage({
      ...ORDER,
      status: 'PAID',
      payment: { latestStatus: 'PAID', attemptCount: 1 },
      payments: [
        {
          id: 'payment-1',
          status: 'PAID',
          amount: ORDER.totals.total,
          createdAt: ORDER.createdAt,
          updatedAt: ORDER.updatedAt,
        },
      ],
    })
    expect(
      await screen.findByRole('heading', { name: 'پرداخت توسط سرور تأیید شد' }),
    ).toBeInTheDocument()
  })
})
