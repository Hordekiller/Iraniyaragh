import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { AuthFixtureClient } from '../lib/auth/fixtures'
import { MemorySessionStore, CrossTabSessionBus, LocalRefreshCoordinator } from '../lib/auth/session-store'
import { CustomerOtpController } from '../lib/auth/ui'
import { AuthProvider } from '../state/AuthProvider'
import { CommerceProvider } from '../state/CommerceProvider'
import type { CommerceApi } from '../services/commerce/context'
import type { OrderSummary } from '@iranyaragh/contracts'
import { OrdersPage } from './OrdersPage'

const ORDER: OrderSummary = {
  id: 'order-1',
  number: 'IR-0001-123',
  status: 'PAID',
  payment: { latestStatus: 'PAID', attemptCount: 1 },
  fulfillmentStatus: 'SHIPPED',
  itemCount: 2,
  totals: {
    subtotal: { amount: '28500000', currency: 'IRR' },
    discount: { amount: '0', currency: 'IRR' },
    shipping: { amount: '450000', currency: 'IRR' },
    total: { amount: '28950000', currency: 'IRR' },
  },
  reservationExpiresAt: '2026-09-14T11:30:00.000Z',
  createdAt: '2026-09-14T10:30:00.000Z',
  updatedAt: '2026-09-14T10:35:00.000Z',
}

function stubCommerce(listOrders: CommerceApi['orders']['listOrders']): CommerceApi {
  return {
    cart: {
      getCart: vi.fn(),
      addLine: vi.fn(),
      setQuantity: vi.fn(),
      removeLine: vi.fn(),
    },
    checkout: { preview: vi.fn(), create: vi.fn() },
    orders: { listOrders, getOrder: vi.fn() },
  }
}

async function signInSession(store: MemorySessionStore) {
  const controller = new CustomerOtpController(new AuthFixtureClient({ store }), store, () => Date.now())
  controller.open()
  controller.setMobile('09123456789')
  await controller.requestOtp()
  controller.setCode('123456')
  await controller.verifyOtp()
}

function renderOrders(commerce: CommerceApi, store: MemorySessionStore) {
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
              <CommerceProvider api={commerce}>
                <OrdersPage />
              </CommerceProvider>
            </AuthProvider>
          }
        />
      </Routes>
    </MemoryRouter>,
  )
}

describe('OrdersPage', () => {
  it('prompts guests to sign in and exposes a login trigger', async () => {
    const listOrders = vi.fn(async () => {
      throw new Error('should not be called')
    })
    renderOrders(stubCommerce(listOrders), new MemorySessionStore())

    expect(await screen.findByRole('heading', { name: 'برای مشاهدهٔ سفارش‌ها وارد شوید' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'ورود / ثبت‌نام' })).toBeInTheDocument()
    expect(listOrders).not.toHaveBeenCalled()
  })

  it('lists a signed-in customer order history', async () => {
    const store = new MemorySessionStore()
    await signInSession(store)
    renderOrders(stubCommerce(vi.fn(async () => [ORDER])), store)

    expect(await screen.findByRole('heading', { name: 'سفارش‌های من' })).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: /سفارش IR-0001-123/ })).toHaveAttribute('href', '/orders/order-1')
    expect(screen.getByText('پرداختشده')).toBeInTheDocument()
    expect(screen.getByText('ارسالشده')).toBeInTheDocument()
    expect(screen.getByText(/۲٬۸۹۵٬۰۰۰ تومان/)).toBeInTheDocument()
  })

  it('shows an empty-history hint for a customer without orders', async () => {
    const store = new MemorySessionStore()
    await signInSession(store)
    renderOrders(stubCommerce(vi.fn(async () => [])), store)

    expect(await screen.findByText('هنوز سفارشی ثبت نکرده‌اید.')).toBeInTheDocument()
  })

  it('shows a Persian error alert when listing fails', async () => {
    const store = new MemorySessionStore()
    await signInSession(store)
    renderOrders(stubCommerce(vi.fn(async () => {
      throw new Error('boom')
    })), store)

    expect(await screen.findByRole('alert')).toHaveTextContent('اتصال به سرور برقرار نشد؛ لطفاً دوباره تلاش کنید.')
  })

  it('links back to the storefront', async () => {
    const store = new MemorySessionStore()
    await signInSession(store)
    renderOrders(stubCommerce(vi.fn(async () => [ORDER])), store)

    expect(await screen.findByRole('link', { name: 'ادامهٔ خرید' })).toHaveAttribute('href', '/products')
  })
  it('offers a retry that re-requests the list instead of a dead-end error', async () => {
    const store = new MemorySessionStore()
    await signInSession(store)
    let attempt = 0
    const listOrders = vi.fn(async () => {
      attempt += 1
      if (attempt === 1) throw new Error('boom')
      return [ORDER]
    })
    renderOrders(stubCommerce(listOrders), store)

    fireEvent.click(await screen.findByRole('button', { name: 'تلاش دوباره' }))
    expect(await screen.findByRole('link', { name: /سفارش IR-0001-123/ })).toHaveAttribute('href', '/orders/order-1')
    expect(listOrders).toHaveBeenCalledTimes(2)
  })

  it('filters by status with counts that add up to the whole list', async () => {
    const store = new MemorySessionStore()
    await signInSession(store)
    const orders: OrderSummary[] = [
      ORDER,
      { ...ORDER, id: 'order-2', number: 'IR-0001-124', status: 'PENDING_PAYMENT' },
      { ...ORDER, id: 'order-3', number: 'IR-0001-125', status: 'CANCELLED' },
      { ...ORDER, id: 'order-4', number: 'IR-0001-126', status: 'RETURNED' },
    ]
    renderOrders(stubCommerce(vi.fn(async () => orders)), store)

    const group = await screen.findByRole('group', { name: 'فیلتر وضعیت سفارش‌ها' })
    const chip = (label: string) =>
      within(group).getByRole('button', { name: new RegExp(label) })
    expect(chip('همه')).toHaveTextContent('۴')
    expect(chip('در انتظار پرداخت')).toHaveTextContent('۱')
    expect(chip('پرداخت‌شده')).toHaveTextContent('۱')
    expect(chip('لغوشده و مرجوعی')).toHaveTextContent('۲')

    fireEvent.click(chip('در انتظار پرداخت'))
    expect(screen.getByRole('link', { name: /سفارش IR-0001-124/ })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /سفارش IR-0001-123/ })).not.toBeInTheDocument()
    expect(chip('در انتظار پرداخت')).toHaveAttribute('aria-pressed', 'true')
  })

  it('sends an unpaid order straight to its payment page', async () => {
    const store = new MemorySessionStore()
    await signInSession(store)
    renderOrders(
      stubCommerce(vi.fn(async () => [
        ORDER,
        { ...ORDER, id: 'order-2', number: 'IR-0001-124', status: 'PENDING_PAYMENT' as const },
      ])),
      store,
    )

    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'پرداخت این سفارش' })).toHaveAttribute(
        'href',
        '/payment/order-2',
      ),
    )
    // A paid order must not be offered a payment button.
    expect(screen.getAllByRole('link', { name: 'پرداخت این سفارش' })).toHaveLength(1)
  })

  it('explains an empty filter result instead of showing a blank page', async () => {
    const store = new MemorySessionStore()
    await signInSession(store)
    renderOrders(stubCommerce(vi.fn(async () => [ORDER])), store)

    const group = await screen.findByRole('group', { name: 'فیلتر وضعیت سفارش‌ها' })
    fireEvent.click(within(group).getByRole('button', { name: /در انتظار پرداخت/ }))

    expect(await screen.findByText('سفارشی با این وضعیت ندارید.')).toBeInTheDocument()
  })
})
