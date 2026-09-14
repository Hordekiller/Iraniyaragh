import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { MemorySessionStore } from '../lib/auth/session-store'
import { AuthFixtureClient } from '../lib/auth/fixtures'
import { AuthProvider } from '../state/AuthProvider'
import { CartProvider } from '../state/CartProvider'
import { OrderProvider } from '../state/OrderProvider'
import type { CartLine, CartState, CreateOrderInput, StoreOrder } from '../services/cart/types'
import type { CartStorage } from '../services/cart/controller'
import type { OrderApi } from '../services/cart/types'
import { CheckoutPage } from './CheckoutPage'

class MemoryCartStorage implements CartStorage {
  state: CartState
  constructor(lines: CartLine[] = []) {
    this.state = { lines: lines.map(line => ({ ...line })) }
  }
  read(): CartState {
    return { lines: this.state.lines.map(line => ({ ...line })) }
  }
  write(next: CartState): void {
    this.state = { lines: next.lines.map(line => ({ ...line })) }
  }
}

const LINE: CartLine = {
  productId: 'p1',
  slug: 'ronix-2210-hammer-drill',
  name: 'دریل رونیکس ۲۲۱۰',
  brand: 'Ronix',
  image: '/images/hero1.jpg',
  unitPrice: { amount: '28500000', currency: 'IRR' },
  oldPrice: null,
  quantity: 1,
}

const ORDER: StoreOrder = {
  id: 'IR-0001-123',
  createdAt: '2026-09-14T10:30:00.000Z',
  status: 'PENDING_PAYMENT',
  items: [
    {
      productId: LINE.productId,
      slug: LINE.slug,
      name: LINE.name,
      image: LINE.image,
      unitPrice: LINE.unitPrice,
      quantity: LINE.quantity,
    },
  ],
  shippingRials: 450000,
  subtotalRials: 28500000,
  totalRials: 28950000,
  shipping: {
    fullName: 'علی رضایی',
    mobile: '09120000000',
    province: 'تهران',
    city: 'تهران',
    postalCode: '1234567890',
    address: 'خیابان امام خمینی، پلاک ۴۲',
  },
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

function PaymentProbe({ orderId }: { orderId: string }) {
  return <span data-testid="payment-probe">{orderId}</span>
}

function renderCheckout(orders: OrderApi, storage: CartStorage) {
  return render(
    <MemoryRouter initialEntries={['/checkout']}>
      <Routes>
        <Route
          path="/checkout"
          element={
            <AuthProvider api={new AuthFixtureClient({ store: new MemorySessionStore() })}>
              <CartProvider storage={storage}>
                <OrderProvider api={orders}>
                  <CheckoutPage />
                </OrderProvider>
              </CartProvider>
            </AuthProvider>
          }
        />
        <Route path="/payment/:id" element={<PaymentProbe orderId="payment" />} />
      </Routes>
    </MemoryRouter>,
  )
}

const VALID_FORM = {
  fullName: 'علی رضایی',
  mobile: '09123456789',
  province: 'تهران',
  city: 'تهران',
  postalCode: '1234567890',
  address: 'خیابان امام خمینی، کوچه ۵، پلاک ۴۲',
}

async function fillForm() {
  fireEvent.change(screen.getByLabelText('نام و نام خانوادگی'), { target: { value: VALID_FORM.fullName } })
  fireEvent.change(screen.getByLabelText('شماره موبایل'), { target: { value: VALID_FORM.mobile } })
  fireEvent.change(screen.getByLabelText('استان'), { target: { value: VALID_FORM.province } })
  fireEvent.change(screen.getByLabelText('شهر'), { target: { value: VALID_FORM.city } })
  fireEvent.change(screen.getByLabelText('کد پستی'), { target: { value: VALID_FORM.postalCode } })
  fireEvent.change(screen.getByLabelText('آدرس کامل'), { target: { value: VALID_FORM.address } })
}

describe('CheckoutPage', () => {
  it('shows an empty-cart prompt when there are no lines', () => {
    renderCheckout(stubOrders(), new MemoryCartStorage([]))

    expect(screen.getByRole('heading', { name: 'سبد خرید خالی است' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'بازگشت به فروشگاه' })).toHaveAttribute('href', '/')
  })

  it('renders the form and order summary for a filled cart', () => {
    renderCheckout(stubOrders(), new MemoryCartStorage([LINE]))

    expect(screen.getByRole('heading', { name: 'تکمیل سفارش' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'خلاصه سفارش' })).toBeInTheDocument()
    expect(screen.getByText('دریل رونیکس ۲۲۱۰')).toBeInTheDocument()
  })

  it('rejects an invalid form with per-field Persian errors', async () => {
    renderCheckout(stubOrders(), new MemoryCartStorage([LINE]))

    fireEvent.click(screen.getByRole('button', { name: 'ثبت سفارش و پرداخت' }))

    expect(await screen.findByText('نام و نام خانوادگی را وارد کنید')).toBeInTheDocument()
    expect(screen.getByText(/شماره موبایل معتبر/)).toBeInTheDocument()
    expect(screen.getAllByText('استان را انتخاب کنید').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('نام شهر را وارد کنید')).toBeInTheDocument()
    expect(screen.getByText('کد پستی ۱۰ رقمی وارد کنید')).toBeInTheDocument()
    expect(screen.getByText('آدرس کامل (حداقل ۱۰ کاراکتر) وارد کنید')).toBeInTheDocument()
  })

  it('clears a field error as soon as the user fixes the field', async () => {
    renderCheckout(stubOrders(), new MemoryCartStorage([LINE]))

    fireEvent.click(screen.getByRole('button', { name: 'ثبت سفارش و پرداخت' }))
    expect(await screen.findByText('نام و نام خانوادگی را وارد کنید')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('نام و نام خانوادگی'), { target: { value: 'علی رضایی' } })

    expect(screen.queryByText('نام و نام خانوادگی را وارد کنید')).not.toBeInTheDocument()
  })

  it('creates an order with a stable idempotency key and navigates to payment', async () => {
    const createOrder = vi.fn(async () => ORDER)
    const orders = stubOrders({ createOrder })
    const cheapLine: CartLine = { ...LINE, unitPrice: { amount: '1000000', currency: 'IRR' } }
    renderCheckout(orders, new MemoryCartStorage([cheapLine]))

    await fillForm()
    fireEvent.click(screen.getByRole('button', { name: 'ثبت سفارش و پرداخت' }))

    expect(await screen.findByTestId('payment-probe')).toBeInTheDocument()
    expect(createOrder).toHaveBeenCalledTimes(1)
    const input = (createOrder.mock.calls as unknown as Array<[CreateOrderInput]>)[0][0]
    expect(input.idempotencyKey).toMatch(/^checkout-/)
    expect(input.items).toHaveLength(1)
    expect(input.subtotalRials).toBe(1000000)
    expect(input.shippingRials).toBe(450000)
    expect(input.totalRials).toBe(1450000)
    expect(input.shipping).toMatchObject({
      fullName: 'علی رضایی',
      mobile: '09123456789',
      province: 'تهران',
      city: 'تهران',
      postalCode: '1234567890',
    })
  })

  it('reuses the same idempotency key when a submission is retried after failure', async () => {
    const createOrder = vi
      .fn<() => Promise<StoreOrder>>()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(ORDER)
    renderCheckout(stubOrders({ createOrder }), new MemoryCartStorage([LINE]))

    await fillForm()
    fireEvent.click(screen.getByRole('button', { name: 'ثبت سفارش و پرداخت' }))

    expect(await screen.findByText('ثبت سفارش با خطا مواجه شد. لطفاً دوباره تلاش کنید.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'ثبت سفارش و پرداخت' }))

    expect(await screen.findByTestId('payment-probe')).toBeInTheDocument()
    expect(createOrder).toHaveBeenCalledTimes(2)
    const calls = createOrder.mock.calls as unknown as Array<[CreateOrderInput]>
    expect(calls[0][0].idempotencyKey).toBe(calls[1][0].idempotencyKey)
  })

  it('charges no shipping above the free-shipping threshold', () => {
    const bigLine: CartLine = { ...LINE, quantity: 8, unitPrice: { amount: '28500000', currency: 'IRR' } }
    renderCheckout(stubOrders(), new MemoryCartStorage([bigLine]))

    expect(screen.getByText('رایگان')).toBeInTheDocument()
  })
})