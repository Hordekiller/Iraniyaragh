import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { MemorySessionStore } from '../lib/auth/session-store'
import { AuthFixtureClient } from '../lib/auth/fixtures'
import { AuthProvider } from '../state/AuthProvider'
import { OrderProvider } from '../state/OrderProvider'
import type { OrderApi, StoreOrder } from '../services/cart/types'
import { OrderDetailPage } from './OrderDetailPage'

const ORDER: StoreOrder = {
  id: 'IR-0001-123',
  createdAt: '2026-09-14T10:30:00.000Z',
  status: 'PAID',
  items: [
    {
      productId: 'p1',
      slug: 'ronix-2210-hammer-drill',
      name: 'دریل رونیکس ۲۲۱۰',
      image: '/images/hero1.jpg',
      unitPrice: { amount: '28500000', currency: 'IRR' },
      quantity: 2,
    },
  ],
  shippingRials: 450000,
  subtotalRials: 57000000,
  totalRials: 57450000,
  shipping: {
    fullName: 'علی رضایی',
    mobile: '09120000000',
    province: 'تهران',
    city: 'تهران',
    postalCode: '1234567890',
    address: 'خیابان امام خمینی، پلاک ۴۲',
  },
  note: 'در صورت موجود نبودن، رنگ مشکی ارسال شود.',
}

function stubOrders(overrides: Partial<OrderApi> = {}): OrderApi {
  return {
    createOrder: vi.fn(async () => ORDER),
    listOrders: vi.fn(async () => [ORDER]),
    getOrder: vi.fn(async () => ORDER),
    markPaid: vi.fn(async () => ORDER),
    ...overrides,
  }
}

function renderDetail(orders: OrderApi) {
  return render(
    <MemoryRouter initialEntries={['/orders/IR-0001-123']}>
      <Routes>
        <Route
          path="/orders/:id"
          element={
            <AuthProvider api={new AuthFixtureClient({ store: new MemorySessionStore() })}>
              <OrderProvider api={orders}>
                <OrderDetailPage />
              </OrderProvider>
            </AuthProvider>
          }
        />
      </Routes>
    </MemoryRouter>,
  )
}

describe('OrderDetailPage', () => {
  it('shows a loading state and then renders order, items, totals and shipping', async () => {
    renderDetail(stubOrders())

    expect(screen.getByText('در حال بارگذاری سفارش...')).toBeInTheDocument()

    expect(await screen.findByRole('heading', { name: /سفارش IR-0001-123/ })).toBeInTheDocument()
    expect(screen.getByText('پرداخت‌شده')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'دریل رونیکس ۲۲۱۰' })).toHaveAttribute('href', '/product/ronix-2210-hammer-drill')
    expect(screen.getAllByText('۵٬۷۰۰٬۰۰۰ تومان').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('علی رضایی')).toBeInTheDocument()
    expect(screen.getByText(/تهران، تهران — خیابان امام خمینی، پلاک ۴۲/)).toBeInTheDocument()
    expect(screen.getByText('در صورت موجود نبودن، رنگ مشکی ارسال شود.')).toBeInTheDocument()
  })

  it('shows a free-shipping label when shipping was free', async () => {
    renderDetail(stubOrders({ getOrder: vi.fn(async (): Promise<StoreOrder> => ({ ...ORDER, shippingRials: 0, totalRials: 57000000 })) }))

    expect(await screen.findByText('رایگان')).toBeInTheDocument()
  })

  it('offers a payment link while the order is unpaid', async () => {
    renderDetail(stubOrders({ getOrder: vi.fn(async (): Promise<StoreOrder> => ({ ...ORDER, status: 'PENDING_PAYMENT' })) }))

    expect(await screen.findByRole('link', { name: 'پرداخت' })).toHaveAttribute('href', '/payment/IR-0001-123')
    expect(screen.getByText('در انتظار پرداخت')).toBeInTheDocument()
  })

  it('hides the payment link once the order is paid', async () => {
    renderDetail(stubOrders())

    expect(await screen.findByRole('heading', { name: /سفارش IR-0001-123/ })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'پرداخت' })).not.toBeInTheDocument()
  })

  it('does not render the note card when the order has no note', async () => {
    renderDetail(stubOrders({ getOrder: vi.fn(async () => ({ ...ORDER, note: undefined })) }))

    expect(await screen.findByRole('heading', { name: /سفارش IR-0001-123/ })).toBeInTheDocument()
    expect(screen.queryByText(/در صورت موجود نبودن/)).not.toBeInTheDocument()
  })

  it('shows the not-found screen when getOrder fails', async () => {
    renderDetail(stubOrders({ getOrder: vi.fn(async () => { throw new Error('boom') }) }))

    expect(await screen.findByRole('heading', { name: 'سفارش یافت نشد' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'بازگشت به سفارش‌ها' })).toHaveAttribute('href', '/orders')
  })
})