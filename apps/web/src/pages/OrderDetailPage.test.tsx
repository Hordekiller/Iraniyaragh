import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { expect, it } from 'vitest'
import { AuthProvider } from '../state/AuthProvider'
import { OrderProvider } from '../state/OrderProvider'
import { ORDER, commerceStub, signedInStore, testAuthProps } from '../test/commerce'
import { OrderDetailPage } from './OrderDetailPage'

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
