import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { AuthFixtureClient } from '../lib/auth/fixtures'
import { MemorySessionStore, CrossTabSessionBus, LocalRefreshCoordinator } from '../lib/auth/session-store'
import { CustomerOtpController } from '../lib/auth/ui'
import { AuthProvider } from '../state/AuthProvider'
import { CommerceProvider } from '../state/CommerceProvider'
import { ToastProvider } from '../components/feedback/Toast'
import type { CommerceApi } from '../services/commerce/context'
import { commerceErrorMessage } from '../services/commerce/types'
import type { OrderSummary } from '@iranyaragh/contracts'
import { AccountPage } from './AccountPage'

function order(overrides: Partial<OrderSummary>): OrderSummary {
  return {
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
    ...overrides,
  }
}

function stubCommerce(listOrders: CommerceApi['orders']['listOrders']): CommerceApi {
  return {
    cart: { getCart: vi.fn(), addLine: vi.fn(), setQuantity: vi.fn(), removeLine: vi.fn() },
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

function renderAccount(commerce: CommerceApi, store: MemorySessionStore) {
  return render(
    <MemoryRouter initialEntries={['/account']}>
      <Routes>
        <Route
          path="/account"
          element={
            <ToastProvider>
              <AuthProvider
                api={new AuthFixtureClient({ store })}
                store={store}
                bus={new CrossTabSessionBus()}
                refreshCoordinator={new LocalRefreshCoordinator()}
              >
                <CommerceProvider api={commerce}>
                  <AccountPage />
                </CommerceProvider>
              </AuthProvider>
            </ToastProvider>
          }
        />
      </Routes>
    </MemoryRouter>,
  )
}

describe('AccountPage', () => {
  it('prompts guests to sign in and exposes a login trigger', async () => {
    const listOrders = vi.fn(async () => {
      throw new Error('should not be called')
    })
    const store = new MemorySessionStore()
    renderAccount(stubCommerce(listOrders), store)

    // The sign-in wall may only appear once the silent restore has settled:
    // rendering it first flashed it at customers who were already signed in.
    expect(screen.queryByRole('heading', { name: 'وارد حساب کاربری شوید' })).not.toBeInTheDocument()

    expect(await screen.findByRole('heading', { name: 'وارد حساب کاربری شوید' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'ورود / ثبت‌نام' })).toBeInTheDocument()
    expect(listOrders).not.toHaveBeenCalled()
  })

  it('summarises the orders delivered by the API instead of placeholder figures', async () => {
    const store = new MemorySessionStore()
    await signInSession(store)
    const commerce = stubCommerce(vi.fn(async () => [
      order({}),
      order({ id: 'order-2', number: 'IR-0001-124', status: 'CANCELLED', totals: { subtotal: { amount: '1000000', currency: 'IRR' }, discount: { amount: '0', currency: 'IRR' }, shipping: { amount: '0', currency: 'IRR' }, total: { amount: '1000000', currency: 'IRR' } } }),
    ]))
    renderAccount(commerce, store)

    expect(await screen.findByRole('heading', { name: 'خلاصه سفارش‌ها' })).toBeInTheDocument()
    expect(await screen.findByText('۲')).toBeInTheDocument()
    expect(screen.getByText(/مجموع پرداخت‌شده/)).toBeInTheDocument()
    // Only the paid order's total counts toward the paid sum.
    expect(screen.getByText('۲٬۸۹۵٬۰۰۰ تومان')).toBeInTheDocument()
    expect(screen.getByText('IR-0001-123')).toBeInTheDocument()
  })

  it('links each order to its detail route by id, not by the human order number', async () => {
    const store = new MemorySessionStore()
    await signInSession(store)
    renderAccount(stubCommerce(vi.fn(async () => [order({ id: 'order-abc', number: 'IR-0001-123' })])), store)

    // The detail route is `/orders/:id` and feeds `getOrder(id)`; linking by
    // number made every account order row dead-end on the 404 page.
    const link = await screen.findByRole('link', { name: /IR-0001-123/ })
    expect(link).toHaveAttribute('href', '/orders/order-abc')
  })

  it('counts and sums every order the API returned, not only the displayed digest', async () => {
    const store = new MemorySessionStore()
    await signInSession(store)
    // Five paid orders, but the digest shows at most three rows. A total
    // computed from the digest would under-report the customer's real spend.
    renderAccount(
      stubCommerce(
        vi.fn(async () =>
          Array.from({ length: 5 }, (_, index) =>
            order({
              id: `order-${index}`,
              number: `IR-0001-12${index}`,
              totals: {
                subtotal: { amount: '1000000', currency: 'IRR' },
                discount: { amount: '0', currency: 'IRR' },
                shipping: { amount: '0', currency: 'IRR' },
                total: { amount: '1000000', currency: 'IRR' },
              },
            }),
          ),
        ),
      ),
      store,
    )

    expect(await screen.findByText('۵')).toBeInTheDocument()
    expect(screen.getByText('۵۰۰٬۰۰۰ تومان')).toBeInTheDocument()
    // Three digest rows only.
    expect(screen.getAllByRole('link', { name: /IR-0001-12/ })).toHaveLength(3)
  })

  it('surfaces an unpaid order as the one action the customer still owes', async () => {
    const store = new MemorySessionStore()
    await signInSession(store)
    renderAccount(
      stubCommerce(
        vi.fn(async () => [
          order({ id: 'order-paid', number: 'IR-0001-100', status: 'PAID' }),
          order({ id: 'order-unpaid', number: 'IR-0001-200', status: 'PENDING_PAYMENT' }),
        ]),
      ),
      store,
    )

    const action = await screen.findByRole('region', { name: 'نیازمند اقدام شما' })
    expect(action).toBeInTheDocument()
    expect(action).toHaveTextContent('۱ سفارش در انتظار پرداخت')
    // The action must go to the payment page for that exact order.
    expect(within(action).getByRole('link')).toHaveAttribute('href', '/payment/order-unpaid')
  })

  it('shows the identity and session facts the API reports and invents nothing else', async () => {
    const store = new MemorySessionStore()
    await signInSession(store)
    renderAccount(stubCommerce(vi.fn(async () => [])), store)

    expect(await screen.findByText('ورود با پیامک')).toBeInTheDocument()
    expect(screen.getByText('شناسهٔ کاربر')).toBeInTheDocument()
    expect(screen.getByText('شروع این نشست')).toBeInTheDocument()
    expect(screen.getByText('انقضای دسترسی')).toBeInTheDocument()
    // The storefront exposes no profile endpoint, so no name/e-mail/address
    // may appear out of nowhere.
    const panel = screen.getByText('شناسهٔ کاربر').closest('dl')!
    expect(panel.textContent).not.toMatch(/@|ایمیل|نام و نام خانوادگی/)
  })

  it('states that no order exists yet for an account without orders', async () => {
    const store = new MemorySessionStore()
    await signInSession(store)
    renderAccount(stubCommerce(vi.fn(async () => [])), store)

    expect(await screen.findByText('هنوز سفارشی ثبت نشده است.')).toBeInTheDocument()
  })

  it('surfaces a commerce failure instead of rendering an empty summary', async () => {
    const store = new MemorySessionStore()
    await signInSession(store)
    renderAccount(stubCommerce(vi.fn(async () => { throw new Error('boom') })), store)

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.queryByText('هنوز سفارشی ثبت نشده است.')).not.toBeInTheDocument()
  })

  it('offers a retry when the order list fails and refetches on demand', async () => {
    const store = new MemorySessionStore()
    await signInSession(store)
    const listOrders = vi
      .fn<CommerceApi['orders']['listOrders']>()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce([order({})])
    renderAccount(stubCommerce(listOrders), store)

    // A failed request must not masquerade as "you have no orders".
    const failure = await screen.findByRole('alert')
    expect(failure).toHaveTextContent(commerceErrorMessage(new Error('boom')))
    expect(screen.queryByText('هنوز سفارشی ثبت نشده است.')).not.toBeInTheDocument()

    fireEvent.click(within(failure).getByRole('button', { name: 'تلاش دوباره' }))

    await waitFor(() => expect(listOrders).toHaveBeenCalledTimes(2))
    expect(await screen.findByText('IR-0001-123')).toBeInTheDocument()
  })
})
