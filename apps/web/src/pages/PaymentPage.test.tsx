import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { AuthFixtureClient } from '../lib/auth/fixtures'
import { MemorySessionStore, CrossTabSessionBus, LocalRefreshCoordinator } from '../lib/auth/session-store'
import { CustomerOtpController } from '../lib/auth/ui'
import { AuthProvider } from '../state/AuthProvider'
import { CommerceProvider } from '../state/CommerceProvider'
import type { CommerceApi } from '../services/commerce/context'
import type { OrderDetail, OrderSummary } from '@iranyaragh/contracts'
import { PaymentPage } from './PaymentPage'

const SUMMARY: OrderSummary = {
  id: 'order-1',
  number: 'IR-0001-123',
  status: 'PENDING_PAYMENT',
  payment: { latestStatus: 'PENDING', attemptCount: 1 },
  fulfillmentStatus: null,
  itemCount: 1,
  totals: {
    subtotal: { amount: '28500000', currency: 'IRR' },
    discount: { amount: '0', currency: 'IRR' },
    shipping: { amount: '450000', currency: 'IRR' },
    total: { amount: '28950000', currency: 'IRR' },
  },
  reservationExpiresAt: '2026-09-14T11:30:00.000Z',
  createdAt: '2026-09-14T10:30:00.000Z',
  updatedAt: '2026-09-14T10:30:00.000Z',
}

const DETAIL: OrderDetail = {
  ...SUMMARY,
  address: {
    provinceCode: 'THR',
    city: 'تهران',
    address: 'خیابان امام خمینی',
    postalCode: '1234567890',
    recipient: 'علی',
    mobile: '09120000000',
  },
  shippingMethod: { code: 'POST', title: 'پست پیشتاز' },
  pricePolicyRevision: 'rev-1',
  shippingPolicyRevision: 'ship-1',
  items: [
    {
      variantId: 'v1',
      sku: 'SKU-2210',
      productTitle: 'دریل رونیکس',
      variantTitle: null,
      quantity: 1,
      unitPrice: { amount: '28500000', currency: 'IRR' },
      lineTotal: { amount: '28500000', currency: 'IRR' },
    },
  ],
  payments: [],
  fulfillment: null,
  timeline: [],
  truncation: { items: false, payments: false, timeline: false },
}

function stubCommerce(getOrder: CommerceApi['orders']['getOrder']): CommerceApi {
  return {
    cart: {
      getCart: vi.fn(async () => {
        throw new Error('unused')
      }),
      addLine: vi.fn(),
      setQuantity: vi.fn(),
      removeLine: vi.fn(),
    },
    checkout: { preview: vi.fn(), create: vi.fn() },
    orders: { listOrders: vi.fn(async () => []), getOrder },
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

function renderPayment(commerce: CommerceApi, store: MemorySessionStore) {
  return render(
    <MemoryRouter initialEntries={['/payment/order-1']}>
      <Routes>
        <Route
          path="/payment/:id"
          element={
            <AuthProvider
              api={new AuthFixtureClient({ store })}
              store={store}
              bus={new CrossTabSessionBus()}
              refreshCoordinator={new LocalRefreshCoordinator()}
            >
              <CommerceProvider api={commerce}>
                <PaymentPage />
              </CommerceProvider>
            </AuthProvider>
          }
        />
      </Routes>
    </MemoryRouter>,
  )
}

describe('PaymentPage', () => {
  it('gates guests behind sign-in', async () => {
    renderPayment(stubCommerce(vi.fn(async () => DETAIL)), new MemorySessionStore())

    expect(await screen.findByRole('heading', { name: 'برای دیدن وضعیت پرداخت وارد شوید' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'ورود / ثبتنام با موبایل' })).toBeInTheDocument()
  })

  it('shows the honest pending-payment state without a fake success button', async () => {
    const store = new MemorySessionStore()
    await signInSession(store)
    renderPayment(stubCommerce(vi.fn(async () => DETAIL)), store)

    expect(await screen.findByRole('heading', { name: 'در انتظار پرداخت' })).toBeInTheDocument()
    expect(screen.getByText(/IR-0001-123/)).toBeInTheDocument()
    expect(screen.getByText(/مهلت رزرو/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /تجدید وضعیت/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /پرداخت موفق/ })).not.toBeInTheDocument()
  })

  it('greets an already-paid order with the success screen', async () => {
    const store = new MemorySessionStore()
    await signInSession(store)
    const paid: OrderDetail = { ...DETAIL, status: 'PAID', payment: { latestStatus: 'PAID', attemptCount: 1 } }
    renderPayment(stubCommerce(vi.fn(async () => paid)), store)

    expect(await screen.findByRole('heading', { name: 'پرداخت با موفقیت انجام شد' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'مشاهده جزئیات سفارش' })).toHaveAttribute('href', '/orders/order-1')
  })

  it('shows the not-found screen only when the API reports a missing order', async () => {
    const store = new MemorySessionStore()
    await signInSession(store)
    renderPayment(
      stubCommerce(
        vi.fn(async () => {
          throw Object.assign(new Error('missing'), { code: 'NOT_FOUND', statusCode: 404 })
        }),
      ),
      store,
    )

    expect(await screen.findByRole('heading', { name: 'سفارش یافت نشد' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'سفارش‌های من' })).toHaveAttribute('href', '/orders')
  })

  it('never tells a customer their order is not theirs when the lookup simply failed', async () => {
    const store = new MemorySessionStore()
    await signInSession(store)
    const getOrder = vi
      .fn<CommerceApi['orders']['getOrder']>()
      .mockRejectedValueOnce(Object.assign(new Error('boom'), { code: 'INTERNAL_ERROR', statusCode: 500 }))
      .mockResolvedValue(DETAIL)
    renderPayment(stubCommerce(getOrder), store)

    // A 500 is not evidence about whose order this is.
    expect(await screen.findByRole('heading', { name: 'وضعیت پرداخت بارگذاری نشد' })).toBeInTheDocument()
    expect(screen.queryByText(/به حساب شما تعلق ندارد/)).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'سفارش یافت نشد' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'تلاش دوباره' }))
    expect(await screen.findByRole('heading', { name: 'در انتظار پرداخت' })).toBeInTheDocument()
  })

  it('re-reads the order on «تجدید وضعیت» and reflects the new status', async () => {
    const store = new MemorySessionStore()
    await signInSession(store)
    const paid: OrderDetail = { ...DETAIL, status: 'PAID', payment: { latestStatus: 'PAID', attemptCount: 1 } }
    const getOrder = vi
      .fn<CommerceApi['orders']['getOrder']>()
      .mockResolvedValueOnce(DETAIL)
      .mockResolvedValueOnce(paid)
    renderPayment(stubCommerce(getOrder), store)

    fireEvent.click(await screen.findByRole('button', { name: /تجدید وضعیت/ }))

    expect(await screen.findByRole('heading', { name: 'پرداخت با موفقیت انجام شد' })).toBeInTheDocument()
    expect(getOrder).toHaveBeenCalledTimes(2)
  })
})
