import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthApiError } from '../../lib/auth/errors'
import { MemorySessionStore } from '../../lib/auth/session-store'
import { AuthProvider } from '../../state/AuthProvider'
import { CartProvider } from '../../state/CartProvider'
import { CART, commerceStub, signedInStore, testAuthProps } from '../../test/commerce'
import { CartPage } from '../../views/CartPage'

const money = (amount: string) => ({ amount, currency: 'IRR' as const })
const discounted = {
  ...CART,
  promotion: {
    couponCode: 'SAVE10',
    couponError: null,
    applied: [{ promotionId: 'p1', name: 'جشنوارهٔ پاییز', kind: 'PERCENTAGE' as const, discount: money('570000'), shippingDiscount: money('0') }],
    itemDiscount: money('570000'),
    payable: money('5130000'),
  },
}

function renderPage(api = commerceStub(), store = signedInStore()) {
  return render(
    <MemoryRouter>
      <AuthProvider {...testAuthProps(store)}>
        <CartProvider api={api}>
          <CartPage />
        </CartProvider>
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('Cart coupon', () => {
  beforeEach(() => globalThis.localStorage?.clear())

  it('sends the code to the server and renders only the server-computed breakdown', async () => {
    const applyCoupon = vi.fn(async () => discounted)
    renderPage(commerceStub({ applyCoupon }))
    fireEvent.change(await screen.findByRole('textbox', { name: 'کد تخفیف' }), { target: { value: 'save10' } })
    fireEvent.click(screen.getByRole('button', { name: 'اعمال' }))
    await waitFor(() => expect(applyCoupon).toHaveBeenCalledWith('save10'))
    expect(await screen.findByText('جشنوارهٔ پاییز')).toBeInTheDocument()
    expect(screen.getByText(/− ۵۷٬۰۰۰ تومان/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'حذف کد تخفیف SAVE10' })).toBeInTheDocument()
  })

  it('shows the precise Persian reason when the server rejects the coupon and keeps totals unchanged', async () => {
    const applyCoupon = vi.fn(async () => {
      throw new AuthApiError({ code: 'COUPON_EXPIRED', message: 'x', statusCode: 422 })
    })
    renderPage(commerceStub({ applyCoupon }))
    fireEvent.change(await screen.findByRole('textbox', { name: 'کد تخفیف' }), { target: { value: 'OLD1' } })
    fireEvent.click(screen.getByRole('button', { name: 'اعمال' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('مهلت استفاده از این کد تخفیف به پایان رسیده است.')
    expect(screen.queryByText(/^−/)).toBeNull()
  })

  it('rejects malformed input locally without calling the server', async () => {
    const applyCoupon = vi.fn(async () => discounted)
    renderPage(commerceStub({ applyCoupon }))
    fireEvent.change(await screen.findByRole('textbox', { name: 'کد تخفیف' }), { target: { value: '<script>' } })
    fireEvent.click(screen.getByRole('button', { name: 'اعمال' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('حروف یا عدد')
    expect(applyCoupon).not.toHaveBeenCalled()
  })

  it('removes an applied coupon through the server', async () => {
    const removeCoupon = vi.fn(async () => CART)
    renderPage(commerceStub({ getCart: vi.fn(async () => discounted), removeCoupon }))
    fireEvent.click(await screen.findByRole('button', { name: 'حذف کد تخفیف SAVE10' }))
    await waitFor(() => expect(removeCoupon).toHaveBeenCalled())
  })

  it('keeps a guest coupon as intent and applies it once the customer cart is ready', async () => {
    const guest = renderPage(commerceStub(), new MemorySessionStore())
    fireEvent.change(await screen.findByRole('textbox', { name: 'کد تخفیف' }), { target: { value: 'WELCOME' } })
    fireEvent.click(screen.getByRole('button', { name: 'اعمال' }))
    expect(await screen.findByText(/ذخیره شد و پس از ورود/)).toBeInTheDocument()
    expect(globalThis.localStorage.getItem('iranyaragh.pendingCoupon')).toBe('WELCOME')
    guest.unmount()

    const applyCoupon = vi.fn(async () => discounted)
    renderPage(commerceStub({ applyCoupon }))
    await waitFor(() => expect(applyCoupon).toHaveBeenCalledWith('WELCOME'))
    await waitFor(() => expect(globalThis.localStorage.getItem('iranyaragh.pendingCoupon')).toBeNull())
  })
})
