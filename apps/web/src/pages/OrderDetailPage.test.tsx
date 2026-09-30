import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { AuthFixtureClient } from '../lib/auth/fixtures'
import { MemorySessionStore, CrossTabSessionBus, LocalRefreshCoordinator } from '../lib/auth/session-store'
import { CustomerOtpController } from '../lib/auth/ui'
import { provinceCodeFor } from '../lib/iran'
import { AuthProvider } from '../state/AuthProvider'
import { CommerceProvider } from '../state/CommerceProvider'
import type { CommerceApi } from '../services/commerce/context'
import type { OrderDetail } from '@iranyaragh/contracts'
import { OrderDetailPage } from './OrderDetailPage'

const ORDER: OrderDetail = {
  id: 'order-1',
  number: 'IR-0001-123',
  status: 'PAID',
  payment: { latestStatus: 'PAID', attemptCount: 1 },
  fulfillmentStatus: 'SHIPPED',
  itemCount: 2,
  totals: {
    subtotal: { amount: '57000000', currency: 'IRR' },
    discount: { amount: '0', currency: 'IRR' },
    shipping: { amount: '450000', currency: 'IRR' },
    total: { amount: '57450000', currency: 'IRR' },
  },
  reservationExpiresAt: '2026-09-14T11:30:00.000Z',
  createdAt: '2026-09-14T10:30:00.000Z',
  updatedAt: '2026-09-14T10:35:00.000Z',
  address: {
    provinceCode: provinceCodeFor('تهران') ?? 'THR',
    city: 'تهران',
    address: 'خیابان امام خمینی، پلاک ۴۲',
    postalCode: '1234567890',
    recipient: 'علی رضایی',
    mobile: '09120000000',
  },
  shippingMethod: { code: 'POST', title: 'پست پیشتاز' },
  pricePolicyRevision: 'rev-1',
  shippingPolicyRevision: 'ship-1',
  items: [
    {
      variantId: 'v1',
      sku: 'SKU-2210',
      productTitle: 'دریل رونیکس ۲۲۱۰',
      variantTitle: null,
      quantity: 2,
      unitPrice: { amount: '28500000', currency: 'IRR' },
      lineTotal: { amount: '57000000', currency: 'IRR' },
    },
  ],
  payments: [
    {
      id: 'pay-1',
      status: 'PAID',
      amount: { amount: '57450000', currency: 'IRR' },
      createdAt: '2026-09-14T10:31:00.000Z',
      updatedAt: '2026-09-14T10:31:00.000Z',
    },
  ],
  fulfillment: { status: 'SHIPPED', createdAt: '2026-09-14T10:40:00.000Z', updatedAt: '2026-09-14T10:40:00.000Z' },
  timeline: [],
  truncation: { items: false, payments: false, timeline: false },
}

function stubCommerce(getOrder: CommerceApi['orders']['getOrder']): CommerceApi {
  return {
    cart: {
      getCart: vi.fn(),
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

function renderDetail(commerce: CommerceApi, store: MemorySessionStore) {
  return render(
    <MemoryRouter initialEntries={['/orders/order-1']}>
      <Routes>
        <Route
          path="/orders/:id"
          element={
            <AuthProvider
              api={new AuthFixtureClient({ store })}
              store={store}
              bus={new CrossTabSessionBus()}
              refreshCoordinator={new LocalRefreshCoordinator()}
            >
              <CommerceProvider api={commerce}>
                <OrderDetailPage />
              </CommerceProvider>
            </AuthProvider>
          }
        />
      </Routes>
    </MemoryRouter>,
  )
}

async function renderSignedIn(commerce: CommerceApi) {
  const store = new MemorySessionStore()
  await signInSession(store)
  return renderDetail(commerce, store)
}

describe('OrderDetailPage', () => {
  it('gates guests behind sign-in', async () => {
    renderDetail(stubCommerce(vi.fn(async () => ORDER)), new MemorySessionStore())

    expect(await screen.findByRole('heading', { name: 'برای مشاهده جزئیات سفارش وارد شوید' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'ورود / ثبتنام با موبایل' })).toBeInTheDocument()
  })

  it('renders the order, items, totals, statuses and shipping address', async () => {
    await renderSignedIn(stubCommerce(vi.fn(async () => ORDER)))

    expect(await screen.findByRole('heading', { name: /سفارش IR-0001-123/ })).toBeInTheDocument()
    expect(screen.getByText('دریل رونیکس ۲۲۱۰')).toBeInTheDocument()
    expect(screen.getAllByText('۵٬۷۴۵٬۰۰۰ تومان').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('پرداخت: پرداختشده')).toBeInTheDocument()
    expect(screen.getByText('ارسال: ارسالشده')).toBeInTheDocument()
    expect(screen.getByText('روش ارسال: پست پیشتاز')).toBeInTheDocument()
    expect(screen.getByText('علی رضایی')).toBeInTheDocument()
    expect(screen.getByText(/تهران، تهران — خیابان امام خمینی، پلاک ۴۲/)).toBeInTheDocument()
  })

  it('shows a free-shipping label when shipping was free', async () => {
    const free: OrderDetail = {
      ...ORDER,
      totals: { ...ORDER.totals, shipping: { amount: '0', currency: 'IRR' }, total: { amount: '57000000', currency: 'IRR' } },
    }
    await renderSignedIn(stubCommerce(vi.fn(async () => free)))

    expect(await screen.findByText('رایگان')).toBeInTheDocument()
  })

  it('offers a payment-status link while the order is unpaid', async () => {
    const unpaid: OrderDetail = { ...ORDER, status: 'PENDING_PAYMENT', payment: { latestStatus: 'PENDING', attemptCount: 1 } }
    await renderSignedIn(stubCommerce(vi.fn(async () => unpaid)))

    expect(await screen.findByRole('link', { name: 'وضعیت پرداخت' })).toHaveAttribute('href', '/payment/order-1')
    expect(screen.getByText('در انتظار پرداخت')).toBeInTheDocument()
  })

  it('hides the payment link once the order is paid', async () => {
    await renderSignedIn(stubCommerce(vi.fn(async () => ORDER)))

    expect(await screen.findByRole('heading', { name: /سفارش IR-0001-123/ })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'وضعیت پرداخت' })).not.toBeInTheDocument()
  })

  it('shows the not-found screen only when the API reports a missing order', async () => {
    await renderSignedIn(
      stubCommerce(
        vi.fn(async () => {
          // The shape the commerce client rejects with, as documented in
          // `load-error.ts`.
          throw Object.assign(new Error('missing'), { code: 'NOT_FOUND', statusCode: 404 })
        }),
      ),
    )

    expect(await screen.findByRole('heading', { name: 'سفارش یافت نشد' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'بازگشت به سفارشها' })).toHaveAttribute('href', '/orders')
  })

  it('offers a retry instead of claiming a failed lookup means a missing order', async () => {
    const order = ORDER
    const getOrder = vi
      .fn<CommerceApi['orders']['getOrder']>()
      .mockRejectedValueOnce(Object.assign(new Error('boom'), { code: 'INTERNAL_ERROR', statusCode: 500 }))
      .mockResolvedValue(order)
    await renderSignedIn(stubCommerce(getOrder))

    // A 500 is not evidence the order was deleted.
    expect(await screen.findByRole('heading', { name: 'سفارش بارگذاری نشد' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'سفارش یافت نشد' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'تلاش دوباره' }))
    expect(await screen.findByText(order.number)).toBeInTheDocument()
  })
})
