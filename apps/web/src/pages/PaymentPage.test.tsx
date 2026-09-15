import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { MemorySessionStore } from '../lib/auth/session-store'
import { AuthFixtureClient } from '../lib/auth/fixtures'
import { AuthProvider } from '../state/AuthProvider'
import { CartProvider } from '../state/CartProvider'
import { OrderProvider } from '../state/OrderProvider'
import type { CartLine, CartState, OrderApi, StoreOrder } from '../services/cart/types'
import type { CartStorage } from '../services/cart/controller'
import { PaymentPage } from './PaymentPage'

class MemoryCartStorage implements CartStorage {
  state: CartState
  constructor(lines: CartLine[]) {
    this.state = { lines: lines.map(line => ({ ...line })) }
  }
  read(): CartState {
    return { lines: this.state.lines.map(line => ({ ...line })) }
  }
  write(next: CartState): void {
    this.state = { lines: next.lines.map(line => ({ ...line })) }
  }
}

const ORDER: StoreOrder = {
  id: 'IR-0001-123',
  createdAt: '2026-09-14T10:30:00.000Z',
  status: 'PENDING_PAYMENT',
  items: [
    {
      productId: 'p1',
      slug: 'ronix-2210-hammer-drill',
      name: 'دریل رونیکس',
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

function paidOrder(): StoreOrder {
  return { ...ORDER, status: 'PAID' }
}

function stubOrders(overrides: Partial<OrderApi> = {}): OrderApi {
  return {
    createOrder: vi.fn(async () => ORDER),
    listOrders: vi.fn(async () => [ORDER]),
    getOrder: vi.fn(async () => ORDER),
    markPaid: vi.fn(async () => paidOrder()),
    ...overrides,
  }
}

function renderPayment(orders: OrderApi, storage: CartStorage) {
  return render(
    <MemoryRouter initialEntries={['/payment/IR-0001-123']}>
      <Routes>
        <Route
          path="/payment/:id"
          element={
            <AuthProvider api={new AuthFixtureClient({ store: new MemorySessionStore() })}>
              <CartProvider storage={storage}>
                <OrderProvider api={orders}>
                  <PaymentPage />
                </OrderProvider>
              </CartProvider>
            </AuthProvider>
          }
        />
      </Routes>
    </MemoryRouter>,
  )
}

describe('PaymentPage', () => {
  it('shows a loading state while resolving the order, then the gateway', async () => {
    const orders = stubOrders()
    renderPayment(orders, new MemoryCartStorage([]))

    expect(screen.getByText('در حال بارگذاری درگاه پرداخت...')).toBeInTheDocument()

    expect(await screen.findByRole('heading', { name: 'درگاه پرداخت' })).toBeInTheDocument()
    expect(screen.getByText(/IR-0001-123/)).toBeInTheDocument()
    expect(screen.getByText(/مبلغ قابل پرداخت/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'پرداخت موفق (تست)' })).toBeInTheDocument()
  })

  it('shows the not-found screen when getOrder fails', async () => {
    const orders = stubOrders({
      getOrder: vi.fn(async () => {
        throw new Error('boom')
      }),
    })
    renderPayment(orders, new MemoryCartStorage([]))

    expect(await screen.findByRole('heading', { name: 'سفارش یافت نشد' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'بازگشت به فروشگاه' })).toHaveAttribute('href', '/')
  })

  it('greets an already-paid order with the success screen', async () => {
    const orders = stubOrders({ getOrder: vi.fn(async () => paidOrder()) })
    renderPayment(orders, new MemoryCartStorage([]))

    expect(await screen.findByRole('heading', { name: 'پرداخت با موفقیت انجام شد' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'مشاهده جزئیات سفارش' })).toHaveAttribute('href', '/orders/IR-0001-123')
  })

  it('marks the order paid, clears matching cart lines and links to the order detail', async () => {
    const markPaid = vi.fn(async () => paidOrder())
    const orders = stubOrders({ markPaid })
    const storage = new MemoryCartStorage([...ORDER.items.map(item => ({
      productId: item.productId,
      slug: item.slug,
      name: item.name,
      brand: 'Ronix',
      image: item.image,
      unitPrice: item.unitPrice,
      oldPrice: null,
      quantity: item.quantity,
    }))])
    renderPayment(orders, storage)

    fireEvent.click(await screen.findByRole('button', { name: 'پرداخت موفق (تست)' }))

    expect(await screen.findByRole('heading', { name: 'پرداخت با موفقیت انجام شد' })).toBeInTheDocument()
    expect(markPaid).toHaveBeenCalledWith('IR-0001-123')
    expect(storage.state.lines).toEqual([])
  })

  it('keeps processing disabled while a payment is in flight', async () => {
    let resolveMarkPaid!: (value: StoreOrder) => void
    const orders = stubOrders({
      markPaid: vi.fn(() => new Promise<StoreOrder>(resolve => { resolveMarkPaid = resolve })),
    })
    renderPayment(orders, new MemoryCartStorage([]))

    const payButton = await screen.findByRole('button', { name: 'پرداخت موفق (تست)' })
    fireEvent.click(payButton)

    expect(screen.getByText('در حال پردازش...')).toBeInTheDocument()

    resolveMarkPaid(paidOrder())

    expect(await screen.findByRole('heading', { name: 'پرداخت با موفقیت انجام شد' })).toBeInTheDocument()
  })

  it('shows a Persian error and keeps the gateway on payment failure', async () => {
    const orders = stubOrders({
      markPaid: vi.fn(async () => {
        throw new Error('gateway down')
      }),
    })
    renderPayment(orders, new MemoryCartStorage([]))

    fireEvent.click(await screen.findByRole('button', { name: 'پرداخت موفق (تست)' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('پرداخت انجام نشد. وضعیت سفارش تغییر نکرد؛ دوباره تلاش کنید.')
    expect(screen.getByRole('heading', { name: 'درگاه پرداخت' })).toBeInTheDocument()
  })

  it('links back to the cart from the unpaid gateway', async () => {
    renderPayment(stubOrders(), new MemoryCartStorage([]))

    await screen.findByRole('heading', { name: 'درگاه پرداخت' })

    expect(screen.getByRole('link', { name: 'بازگشت به سبد خرید' })).toHaveAttribute('href', '/cart')
  })
})