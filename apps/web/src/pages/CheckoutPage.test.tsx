import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { AuthFixtureClient } from '../lib/auth/fixtures'
import { MemorySessionStore, CrossTabSessionBus, LocalRefreshCoordinator } from '../lib/auth/session-store'
import { CustomerOtpController } from '../lib/auth/ui'
import { AuthProvider } from '../state/AuthProvider'
import { CartProvider } from '../state/CartProvider'
import { CommerceProvider } from '../state/CommerceProvider'
import type { CommerceApi } from '../services/commerce/context'
import type { CartState } from '../services/cart/types'
import type { CartStorage } from '../services/cart/controller'
import type { CartView, CheckoutOrder, ShippingQuote } from '@iranyaragh/contracts'
import { CheckoutPage } from './CheckoutPage'

class MemoryCartStorage implements CartStorage {
  state: CartState = { lines: [] }
  read(): CartState {
    return { lines: this.state.lines.map(line => ({ ...line })) }
  }
  write(next: CartState): void {
    this.state = { lines: next.lines.map(line => ({ ...line })) }
  }
}

const SHIPPING: ShippingQuote[] = [
  {
    quoteId: 'post-paid',
    method: 'POST',
    title: 'پست پیشتاز',
    amount: { amount: '450000', currency: 'IRR' },
    policyRevision: 'ship-1',
    pricePolicyRevision: 'rev-1',
    cartVersion: 1,
    expiresAt: '2026-09-14T11:30:00.000Z',
  },
]

function cartView(unitPrice = '1000000'): CartView {
  const subtotal = unitPrice
  const total = String(Number(unitPrice) + 450000)
  return {
    id: 'cart-1',
    version: 1,
    lines: [
      {
        variantId: 'v1',
        quantity: 1,
        title: 'دریل رونیکس ۲۲۱۰',
        sku: 'SKU-2210',
        unitPrice: { amount: unitPrice, currency: 'IRR' },
        lineTotal: { amount: unitPrice, currency: 'IRR' },
        available: 10,
      },
    ],
    quote: {
      subtotal: { amount: subtotal, currency: 'IRR' },
      shipping: { amount: '450000', currency: 'IRR' },
      total: { amount: total, currency: 'IRR' },
      currency: 'IRR',
      pricePolicyRevision: 'rev-1',
      quotedAt: '2026-09-14T10:00:00.000Z',
    },
    updatedAt: '2026-09-14T10:00:00.000Z',
  }
}

const ORDER: CheckoutOrder = {
  id: 'order-1',
  number: 'IR-0001',
  status: 'PENDING_PAYMENT',
  items: [
    {
      variantId: 'v1',
      productTitle: 'دریل رونیکس ۲۲۱۰',
      variantTitle: null,
      sku: 'SKU-2210',
      quantity: 1,
      unitPrice: { amount: '1000000', currency: 'IRR' },
      lineTotal: { amount: '1000000', currency: 'IRR' },
    },
  ],
  subtotal: { amount: '1000000', currency: 'IRR' },
  discount: { amount: '0', currency: 'IRR' },
  shipping: { amount: '450000', currency: 'IRR' },
  total: { amount: '1450000', currency: 'IRR' },
  address: {
    provinceCode: 'THR',
    city: 'تهران',
    address: 'خیابان امام خمینی، کوچه ۵، پلاک ۴۲',
    postalCode: '1234567890',
    recipient: 'علی رضایی',
    mobile: '09123456789',
  },
  shippingQuote: SHIPPING[0],
  pricePolicyRevision: 'rev-1',
  reservationExpiresAt: '2026-09-14T11:30:00.000Z',
  createdAt: '2026-09-14T10:30:00.000Z',
}

function stubCommerce(overrides: {
  cart?: Partial<CommerceApi['cart']>
  checkout?: Partial<CommerceApi['checkout']>
} = {}): CommerceApi {
  return {
    cart: {
      getCart: vi.fn(async () => cartView()),
      addLine: vi.fn(async () => cartView()),
      setQuantity: vi.fn(async () => cartView()),
      removeLine: vi.fn(async () => cartView()),
      ...overrides.cart,
    },
    checkout: {
      preview: vi.fn(async () => ({ cart: cartView(), shipping: SHIPPING })),
      create: vi.fn(async () => ORDER),
      ...overrides.checkout,
    },
    orders: {
      listOrders: vi.fn(async () => []),
      getOrder: vi.fn(async () => {
        throw new Error('not used')
      }),
    },
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

function PaymentProbe() {
  return <span data-testid="payment-probe">payment</span>
}

function renderCheckout(commerce: CommerceApi, store: MemorySessionStore, cartApi = commerce.cart) {
  return render(
    <MemoryRouter initialEntries={['/checkout']}>
      <Routes>
        <Route
          path="/checkout"
          element={
            <AuthProvider
              api={new AuthFixtureClient({ store })}
              store={store}
              bus={new CrossTabSessionBus()}
              refreshCoordinator={new LocalRefreshCoordinator()}
            >
              <CommerceProvider api={commerce}>
                <CartProvider storage={new MemoryCartStorage()} cartApi={cartApi}>
                  <CheckoutPage />
                </CartProvider>
              </CommerceProvider>
            </AuthProvider>
          }
        />
        <Route path="/payment/:id" element={<PaymentProbe />} />
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
  await screen.findByLabelText('نام و نام خانوادگی')
  fireEvent.change(screen.getByLabelText('نام و نام خانوادگی'), { target: { value: VALID_FORM.fullName } })
  fireEvent.change(screen.getByLabelText('شماره موبایل'), { target: { value: VALID_FORM.mobile } })
  fireEvent.change(screen.getByLabelText('استان'), { target: { value: VALID_FORM.province } })
  fireEvent.change(screen.getByLabelText('شهر'), { target: { value: VALID_FORM.city } })
  fireEvent.change(screen.getByLabelText('کد پستی'), { target: { value: VALID_FORM.postalCode } })
  fireEvent.change(screen.getByLabelText('آدرس کامل'), { target: { value: VALID_FORM.address } })
}

describe('CheckoutPage', () => {
  it('gates guests behind sign-in', async () => {
    renderCheckout(stubCommerce(), new MemorySessionStore())

    expect(await screen.findByRole('heading', { name: 'برای تکمیل سفارش وارد شوید' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'ورود / ثبتنام با موبایل' })).toBeInTheDocument()
  })

  it('shows an empty-cart prompt when the server cart has no lines', async () => {
    const store = new MemorySessionStore()
    await signInSession(store)
    const emptyCart: CartView = { ...cartView(), lines: [], quote: { ...cartView().quote, subtotal: { amount: '0', currency: 'IRR' }, total: { amount: '0', currency: 'IRR' } } }
    const commerce = stubCommerce({ cart: { getCart: vi.fn(async () => emptyCart) } })
    renderCheckout(commerce, store, commerce.cart)

    expect(await screen.findByRole('heading', { name: 'سبد خرید خالی است' })).toBeInTheDocument()
  })

  it('renders the form and order summary for a filled server cart', async () => {
    const store = new MemorySessionStore()
    await signInSession(store)
    const commerce = stubCommerce()
    renderCheckout(commerce, store, commerce.cart)

    expect(await screen.findByRole('heading', { name: 'تکمیل سفارش' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'خلاصه سفارش' })).toBeInTheDocument()
    expect(await screen.findByText('دریل رونیکس ۲۲۱۰')).toBeInTheDocument()
  })

  it('rejects an invalid form with per-field Persian errors', async () => {
    const store = new MemorySessionStore()
    await signInSession(store)
    const commerce = stubCommerce()
    renderCheckout(commerce, store, commerce.cart)

    fireEvent.click(await screen.findByRole('button', { name: 'ادامه و محاسبه ارسال' }))

    // The field-level messages are the ones wired to each control through
    // aria-describedby, so they are asserted by id rather than by text: the
    // summary deliberately repeats them.
    expect(await screen.findByText('نام و نام خانوادگی را وارد کنید')).toBeInTheDocument()
    expect(document.getElementById('mobile-error')).toHaveTextContent('شماره موبایل معتبر')
    expect(document.getElementById('province-error')).toHaveTextContent('استان را انتخاب کنید')
    expect(document.getElementById('city-error')).toHaveTextContent('نام شهر را وارد کنید')
    expect(document.getElementById('postal-code-error')).toHaveTextContent('کد پستی ۱۰ رقمی وارد کنید')
    expect(document.getElementById('address-error')).toHaveTextContent('حداقل ۱۰ کاراکتر')
    expect(commerce.checkout.preview).not.toHaveBeenCalled()
  })

  it('summarises every invalid field and focuses the first one', async () => {
    const store = new MemorySessionStore()
    await signInSession(store)
    const commerce = stubCommerce()
    renderCheckout(commerce, store, commerce.cart)

    fireEvent.click(await screen.findByRole('button', { name: 'ادامه و محاسبه ارسال' }))

    // 3.3.1: a failed submit has to say what is wrong and where, not just
    // redden the fields and leave the caret on the submit button.
    const summary = await screen.findByRole('alert')
    expect(summary).toHaveTextContent('۶ فیلد نیاز به اصلاح دارد')
    for (const label of ['نام و نام خانوادگی', 'شماره موبایل', 'استان', 'شهر', 'کد پستی', 'آدرس کامل']) {
      expect(summary).toHaveTextContent(label)
    }

    // 3.3.3 / focus order: focus lands on the first invalid control in
    // document order, which is the name field, not the submit button.
    expect(document.getElementById('fullName')).toHaveFocus()
    expect(document.getElementById('fullName')).toHaveAttribute('aria-invalid', 'true')
  })

  it('jumps from the error summary to the field it names', async () => {
    const store = new MemorySessionStore()
    await signInSession(store)
    const commerce = stubCommerce()
    renderCheckout(commerce, store, commerce.cart)

    fireEvent.click(await screen.findByRole('button', { name: 'ادامه و محاسبه ارسال' }))
    const summary = await screen.findByRole('alert')

    fireEvent.click(within(summary).getByRole('button', { name: /شهر/ }))

    expect(document.getElementById('city')).toHaveFocus()
  })

  it('does not show the summary before the first submit attempt', async () => {
    const store = new MemorySessionStore()
    await signInSession(store)
    const commerce = stubCommerce()
    renderCheckout(commerce, store, commerce.cart)

    await screen.findByRole('button', { name: 'ادامه و محاسبه ارسال' })
    expect(screen.queryByText(/فیلد نیاز به اصلاح/)).not.toBeInTheDocument()
  })

  it('previews shipping, then creates the order and navigates to payment', async () => {
    const store = new MemorySessionStore()
    await signInSession(store)
    const commerce = stubCommerce()
    renderCheckout(commerce, store, commerce.cart)

    await fillForm()
    fireEvent.click(await screen.findByRole('button', { name: 'ادامه و محاسبه ارسال' }))

    expect(await screen.findByText('روش ارسال')).toBeInTheDocument()
    expect(commerce.checkout.preview).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'ثبت نهایی سفارش' }))

    expect(await screen.findByTestId('payment-probe')).toBeInTheDocument()
    expect(commerce.checkout.create).toHaveBeenCalledTimes(1)
    const [address, quoteId, key] = (commerce.checkout.create as ReturnType<typeof vi.fn>).mock.calls[0] as [Record<string, string>, string, string]
    expect(quoteId).toBe('post-paid')
    expect(key).toMatch(/^checkout-/)
    expect(address).toMatchObject({ provinceCode: 'THR', recipient: 'علی رضایی', mobile: '09123456789', postalCode: '1234567890' })
  })

  it('reuses the same idempotency key when creation is retried after failure', async () => {
    const store = new MemorySessionStore()
    await signInSession(store)
    const create = vi
      .fn<() => Promise<CheckoutOrder>>()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(ORDER)
    const commerce = stubCommerce({ checkout: { create } })
    renderCheckout(commerce, store, commerce.cart)

    await fillForm()
    fireEvent.click(await screen.findByRole('button', { name: 'ادامه و محاسبه ارسال' }))
    fireEvent.click(await screen.findByRole('button', { name: 'ثبت نهایی سفارش' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('اتصال به سرور برقرار نشد؛ لطفاً دوباره تلاش کنید.')

    fireEvent.click(screen.getByRole('button', { name: 'ثبت نهایی سفارش' }))

    expect(await screen.findByTestId('payment-probe')).toBeInTheDocument()
    expect(create).toHaveBeenCalledTimes(2)
    const calls = create.mock.calls as unknown as Array<[unknown, string, string]>
    expect(calls[0][2]).toBe(calls[1][2])
  })

  it('lets the user switch shipping quote before creating the order', async () => {
    const store = new MemorySessionStore()
    await signInSession(store)
    const shipping: ShippingQuote[] = [
      SHIPPING[0],
      { ...SHIPPING[0], quoteId: 'tipax', title: 'تیپاکس', amount: { amount: '0', currency: 'IRR' } },
    ]
    const commerce = stubCommerce({ checkout: { preview: vi.fn(async () => ({ cart: cartView(), shipping })) } })
    renderCheckout(commerce, store, commerce.cart)

    await fillForm()
    fireEvent.click(await screen.findByRole('button', { name: 'ادامه و محاسبه ارسال' }))
    fireEvent.click(await screen.findByRole('radio', { name: /تیپاکس/ }))
    fireEvent.click(screen.getByRole('button', { name: 'ثبت نهایی سفارش' }))

    expect(await screen.findByTestId('payment-probe')).toBeInTheDocument()
    const [, quoteId] = (commerce.checkout.create as ReturnType<typeof vi.fn>).mock.calls[0] as [Record<string, string>, string, string]
    expect(quoteId).toBe('tipax')
  })
})
