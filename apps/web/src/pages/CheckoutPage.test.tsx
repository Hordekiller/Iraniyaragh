import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../state/AuthProvider'
import { CartProvider } from '../state/CartProvider'
import { MemorySessionStore } from '../lib/auth/session-store'
import {
  ORDER,
  commerceStub,
  signedInStore,
  testAuthProps,
} from '../test/commerce'
import { CheckoutPage } from './CheckoutPage'
import { getCustomerAccount } from '../services/customer-account'

vi.mock('../services/customer-account', () => ({
  getCustomerAccount: vi.fn().mockRejectedValue(new Error('unavailable')),
}))

function renderPage(api = commerceStub(), store = signedInStore()) {
  return render(
    <MemoryRouter initialEntries={['/checkout']}>
      <Routes>
        <Route
          path="/checkout"
          element={
            <AuthProvider {...testAuthProps(store)}>
              <CartProvider api={api}>
                <CheckoutPage />
              </CartProvider>
            </AuthProvider>
          }
        />
        <Route
          path="/payment/:id"
          element={<div data-testid="payment-route" />}
        />
      </Routes>
    </MemoryRouter>,
  )
}

function fillValidAddress() {
  fireEvent.change(screen.getByLabelText('نام تحویل‌گیرنده'), {
    target: { value: 'علی رضایی' },
  })
  fireEvent.change(screen.getByLabelText('شماره موبایل'), {
    target: { value: '09123456789' },
  })
  fireEvent.change(screen.getByLabelText('استان'), {
    target: { value: 'تهران' },
  })
  fireEvent.change(screen.getByLabelText('شهر'), {
    target: { value: 'تهران' },
  })
  fireEvent.change(screen.getByLabelText('کد پستی'), {
    target: { value: '1234567890' },
  })
  fireEvent.change(screen.getByLabelText('نشانی کامل'), {
    target: { value: 'خیابان امام خمینی، پلاک ۴۲' },
  })
}

describe('CheckoutPage', () => {
  it('lets a signed-in customer use a saved address without changing its order snapshot', async () => {
    vi.mocked(getCustomerAccount).mockResolvedValueOnce({
      id: 'customer-1', mobile: '+989123456789', firstName: 'علی', lastName: 'رضایی', version: 3,
      addresses: [{
        id: 'address-1', label: 'خانه', receiverName: 'علی رضایی', mobile: '+989123456789',
        provinceCode: 'TEH', city: 'تهران', addressLine: 'خیابان ولیعصر، پلاک ۱۰', postalCode: '1234567890',
        isDefault: true, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
      }],
    })
    const api = commerceStub()
    renderPage(api)
    fireEvent.click(await screen.findByRole('button', { name: 'خانه — TEH، تهران' }))
    fireEvent.click(screen.getByRole('button', { name: 'محاسبه هزینه ارسال' }))
    await waitFor(() => expect(api.previewCheckout).toHaveBeenCalledWith(expect.objectContaining({
      recipient: 'علی رضایی', mobile: '09123456789', provinceCode: 'TEH', city: 'تهران',
      postalCode: '1234567890', address: 'خیابان ولیعصر، پلاک ۱۰',
    })))
    expect(screen.getByRole('link', { name: 'مدیریت نشانی‌ها' })).toHaveAttribute('href', '/account/addresses')
  })

  it('defers OTP until Checkout and explains that the Guest Cart is preserved', async () => {
    renderPage(commerceStub(), new MemorySessionStore())

    expect(
      await screen.findByRole('heading', {
        name: 'برای ادامه خرید، شماره موبایل را تأیید کنید',
      }),
    ).toBeInTheDocument()
    expect(screen.getByText(/کالاهای سبد شما حفظ می‌شوند/)).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'ورود سریع با موبایل' }),
    ).toBeInTheDocument()
  })

  it('blocks Checkout while the Guest Cart merge is still in flight', async () => {
    const api = commerceStub({
      mergeGuestCart: vi.fn(() => new Promise<never>(() => undefined)),
    })

    renderPage(api)

    expect(
      await screen.findByRole('heading', {
        name: 'در حال اتصال سبد به حساب شما',
      }),
    ).toBeInTheDocument()
    expect(screen.queryByLabelText('نام تحویل‌گیرنده')).not.toBeInTheDocument()
  })

  it('validates the address before asking the server for quotes', async () => {
    const api = commerceStub()
    renderPage(api)
    await screen.findByText('دریل رونیکس ۲۲۱۰')
    fireEvent.click(screen.getByRole('button', { name: 'محاسبه هزینه ارسال' }))
    expect(
      await screen.findByText('نام تحویل‌گیرنده را وارد کنید.'),
    ).toBeInTheDocument()
    expect(api.previewCheckout).not.toHaveBeenCalled()
  })

  it('previews shipping, submits only address/quote and reuses the checkout key after an ambiguous failure', async () => {
    const createCheckout = vi
      .fn()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce({ id: ORDER.id })
    const api = commerceStub({ createCheckout })
    renderPage(api)
    await screen.findByText('دریل رونیکس ۲۲۱۰')
    fillValidAddress()
    fireEvent.click(screen.getByRole('button', { name: 'محاسبه هزینه ارسال' }))
    expect(await screen.findByText('ارسال استاندارد')).toBeInTheDocument()
    expect(api.previewCheckout).toHaveBeenCalledWith(
      expect.objectContaining({ provinceCode: 'TEH', mobile: '09123456789' }),
    )

    fireEvent.click(screen.getByRole('button', { name: 'ثبت سفارش' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'عملیات انجام نشد',
    )
    fireEvent.click(screen.getByRole('button', { name: 'ثبت سفارش' }))
    expect(await screen.findByTestId('payment-route')).toBeInTheDocument()
    expect(createCheckout).toHaveBeenCalledTimes(2)
    const first = createCheckout.mock.calls[0][2]
    const second = createCheckout.mock.calls[1][2]
    expect(first).toMatch(/^checkout-/)
    expect(second).toBe(first)
    expect(createCheckout.mock.calls[0][1]).toBe('quote-1')
  })

  it('blocks duplicate submits while checkout is in flight', async () => {
    let resolve!: (value: unknown) => void
    const createCheckout = vi.fn(
      () =>
        new Promise((value) => {
          resolve = value
        }),
    )
    const api = commerceStub({ createCheckout: createCheckout as never })
    renderPage(api)
    await screen.findByText('دریل رونیکس ۲۲۱۰')
    fillValidAddress()
    fireEvent.click(screen.getByRole('button', { name: 'محاسبه هزینه ارسال' }))
    const button = await screen.findByRole('button', { name: 'ثبت سفارش' })
    await waitFor(() => expect(button).toBeEnabled())
    fireEvent.click(button)
    await waitFor(() => expect(createCheckout).toHaveBeenCalledTimes(1))
    expect(button).toBeDisabled()
    fireEvent.click(button)
    expect(createCheckout).toHaveBeenCalledTimes(1)
    resolve({ id: ORDER.id })
    await waitFor(() => expect(createCheckout).toHaveBeenCalledTimes(1))
  })
})
