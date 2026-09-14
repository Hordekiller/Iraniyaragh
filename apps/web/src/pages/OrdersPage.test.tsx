import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { AuthFixtureClient } from '../lib/auth/fixtures'
import { MemorySessionStore, CrossTabSessionBus, LocalRefreshCoordinator } from '../lib/auth/session-store'
import { CustomerOtpController } from '../lib/auth/ui'
import { AuthProvider } from '../state/AuthProvider'
import { OrderProvider } from '../state/OrderProvider'
import type { OrderApi, OrderItem, StoreOrder } from '../services/cart/types'
import { OrdersPage } from './OrdersPage'

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
      quantity: 1,
    },
  ],
  shippingRials: 450000,
  subtotalRials: 28500000,
  totalRials: 28950000,
  shipping: {
    fullName: 'علی',
    mobile: '09120000000',
    province: 'تهران',
    city: 'تهران',
    postalCode: '1234567890',
    address: 'خیابان امام خمینی',
  },
}

async function signInSession(store: MemorySessionStore) {
  const controller = new CustomerOtpController(new AuthFixtureClient({ store }), store, () => Date.now())
  controller.open()
  controller.setMobile('09123456789')
  await controller.requestOtp()
  controller.setCode('123456')
  await controller.verifyOtp()
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

function renderOrders(orders: OrderApi, store: MemorySessionStore) {
  return render(
    <MemoryRouter initialEntries={['/orders']}>
      <Routes>
        <Route
          path="/orders"
          element={
            <AuthProvider
              api={new AuthFixtureClient({ store })}
              store={store}
              bus={new CrossTabSessionBus()}
              refreshCoordinator={new LocalRefreshCoordinator()}
            >
              <OrderProvider api={orders}>
                <OrdersPage />
              </OrderProvider>
            </AuthProvider>
          }
        />
      </Routes>
    </MemoryRouter>,
  )
}

describe('OrdersPage', () => {
  it('prompts guests to sign in and exposes a login trigger', async () => {
    const orders = stubOrders({
      listOrders: vi.fn(async () => { throw new Error('should not be called') }),
    })
    renderOrders(orders, new MemorySessionStore())

    expect(await screen.findByRole('heading', { name: 'برای مشاهده سفارش‌ها وارد شوید' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'ورود / ثبت‌نام' })).toBeInTheDocument()
    expect(orders.listOrders).not.toHaveBeenCalled()
  })

  it('lists a signed-in customer order history', async () => {
    const store = new MemorySessionStore()
    await signInSession(store)
    const orders = stubOrders({
      listOrders: vi.fn(async () => [ORDER]),
    })
    renderOrders(orders, store)

    expect(await screen.findByRole('heading', { name: 'سفارش‌های من' })).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: /سفارش IR-0001-123/ })).toHaveAttribute('href', '/orders/IR-0001-123')
    expect(screen.getByText('پرداخت‌شده')).toBeInTheDocument()
    expect(screen.getByText(/۲٬۸۹۵٬۰۰۰ تومان/)).toBeInTheDocument()
  })

  it('summarizes only the first four items and counts the rest', async () => {
    const store = new MemorySessionStore()
    await signInSession(store)
    const manyItems: OrderItem[] = Array.from({ length: 6 }, (_, i) => ({
      productId: `p${i}`,
      slug: `product-${i}`,
      name: `محصول ${i}`,
      image: '/images/hero1.jpg',
      unitPrice: { amount: '1000000', currency: 'IRR' },
      quantity: 1,
    }))
    renderOrders(stubOrders({ listOrders: vi.fn(async (): Promise<StoreOrder[]> => [{ ...ORDER, items: manyItems }]) }), store)

    expect(await screen.findByRole('link', { name: /سفارش IR-0001-123/ })).toBeInTheDocument()
    expect(screen.getByText('+۲ دیگر')).toBeInTheDocument()
  })

  it('shows an empty-history hint for a customer without orders', async () => {
    const store = new MemorySessionStore()
    await signInSession(store)
    renderOrders(stubOrders({ listOrders: vi.fn(async () => []) }), store)

    expect(await screen.findByText('هنوز سفارشی ثبت نکرده‌اید.')).toBeInTheDocument()
  })

  it('shows a Persian error alert when listing fails', async () => {
    const store = new MemorySessionStore()
    await signInSession(store)
    renderOrders(stubOrders({ listOrders: vi.fn(async () => { throw new Error('boom') }) }), store)

    expect(await screen.findByRole('alert')).toHaveTextContent('دریافت سفارش‌ها با خطا مواجه شد.')
  })

  it('links back to the storefront', async () => {
    const store = new MemorySessionStore()
    await signInSession(store)
    renderOrders(stubOrders(), store)

    expect(await screen.findByRole('link', { name: 'بازگشت به فروشگاه' })).toHaveAttribute('href', '/')
  })
})