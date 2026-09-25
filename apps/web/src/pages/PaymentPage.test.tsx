import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthApiError } from '../lib/auth/errors'
import { AuthProvider } from '../state/AuthProvider'
import { OrderProvider } from '../state/OrderProvider'
import {
  ORDER,
  commerceStub,
  signedInStore,
  testAuthProps,
} from '../test/commerce'
import { PaymentPage } from './PaymentPage'

const gateway = vi.hoisted(() => ({ redirect: vi.fn() }))
vi.mock('../services/commerce/payment', async (importOriginal) => {
  const original = await importOriginal<typeof import('../services/commerce/payment')>()
  return { ...original, redirectToPaymentGateway: gateway.redirect }
})

function renderPage(order = ORDER, overrides = {}, returnMode = false) {
  const store = signedInStore()
  const api = commerceStub({ getOrder: async () => order, ...overrides })
  return render(
    <MemoryRouter initialEntries={[returnMode ? '/payment/order-1/result' : '/payment/order-1']}>
      <Routes>
        <Route
          path={returnMode ? '/payment/:id/result' : '/payment/:id'}
          element={
            <AuthProvider {...testAuthProps(store)}>
              <OrderProvider
                api={api}
              >
                <PaymentPage returnMode={returnMode} />
              </OrderProvider>
            </AuthProvider>
          }
        />
      </Routes>
    </MemoryRouter>,
  )
}

describe('PaymentPage', () => {
  beforeEach(() => gateway.redirect.mockReset())

  it('offers an explicit payment action without assuming settlement', async () => {
    renderPage()
    expect(
      await screen.findByRole('heading', {
        name: 'سفارش در انتظار پرداخت است',
      }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /پرداخت با زرین‌پال/ })).toBeInTheDocument()
    expect(screen.queryByText(/پرداخت توسط سرور تأیید شد/)).not.toBeInTheDocument()
  })

  it('shows a server-owned return result without offering a second payment', async () => {
    const initiatePayment = vi.fn()
    renderPage(ORDER, { initiatePayment }, true)
    expect(await screen.findByRole('heading', { name: 'سفارش در انتظار پرداخت است' })).toBeInTheDocument()
    expect(screen.getByText(/نتیجهٔ بازگشت از درگاه قطعی نیست/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /پرداخت با زرین‌پال/ })).not.toBeInTheDocument()
    expect(initiatePayment).not.toHaveBeenCalled()
  })

  it('initiates once and redirects only to the validated provider URL', async () => {
    const initiatePayment = vi.fn(async () => ({
      paymentId: 'payment-1',
      status: 'PENDING' as const,
      provider: 'zarinpal' as const,
      amount: ORDER.totals.total,
      authority: 'sandbox-authority-1',
      redirectUrl: 'https://sandbox.zarinpal.com/pg/StartPay/sandbox-authority-1',
    }))
    renderPage(ORDER, { initiatePayment })
    fireEvent.click(await screen.findByRole('button', { name: /پرداخت با زرین‌پال/ }))
    await waitFor(() => expect(gateway.redirect).toHaveBeenCalledWith(
      'https://sandbox.zarinpal.com/pg/StartPay/sandbox-authority-1',
    ))
    expect(initiatePayment).toHaveBeenCalledWith(ORDER.id, expect.stringMatching(/^payment-/))
  })

  it('blocks repeat initiation after an unconfirmed gateway result', async () => {
    const initiatePayment = vi.fn(async () => {
      throw new AuthApiError({
        code: 'PAYMENT_RESULT_UNCONFIRMED',
        message: 'unknown',
        statusCode: 503,
      })
    })
    renderPage(ORDER, { initiatePayment })
    fireEvent.click(await screen.findByRole('button', { name: /پرداخت با زرین‌پال/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/نتیجه آغاز پرداخت نامشخص است/)
    expect(screen.queryByRole('button', { name: /پرداخت با زرین‌پال/ })).not.toBeInTheDocument()
    expect(gateway.redirect).not.toHaveBeenCalled()
  })

  it('coalesces rapid clicks into one gateway initiation', async () => {
    let finish: (() => void) | undefined
    const wait = new Promise<void>((resolve) => { finish = resolve })
    const initiatePayment = vi.fn(async () => {
      await wait
      return {
        paymentId: 'payment-1',
        status: 'PENDING' as const,
        provider: 'zarinpal' as const,
        amount: ORDER.totals.total,
        authority: 'sandbox-authority-1',
        redirectUrl: 'https://sandbox.zarinpal.com/pg/StartPay/sandbox-authority-1',
      }
    })
    renderPage(ORDER, { initiatePayment })
    const button = await screen.findByRole('button', { name: /پرداخت با زرین‌پال/ })
    fireEvent.click(button)
    fireEvent.click(button)
    expect(initiatePayment).toHaveBeenCalledOnce()
    finish?.()
    await waitFor(() => expect(gateway.redirect).toHaveBeenCalledOnce())
  })

  it('rejects a provider response whose amount differs from the order', async () => {
    renderPage(ORDER, {
      initiatePayment: async () => ({
        paymentId: 'payment-1',
        status: 'PENDING',
        provider: 'zarinpal',
        amount: { amount: '1', currency: 'IRR' },
        authority: 'sandbox-authority-1',
        redirectUrl: 'https://sandbox.zarinpal.com/pg/StartPay/sandbox-authority-1',
      }),
    })
    fireEvent.click(await screen.findByRole('button', { name: /پرداخت با زرین‌پال/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/نتیجه آغاز پرداخت نامشخص است/)
    expect(gateway.redirect).not.toHaveBeenCalled()
  })

  it('shows a payment-specific unavailable message and permits a deliberate retry', async () => {
    const initiatePayment = vi.fn(async () => {
      throw new AuthApiError({
        code: 'UPSTREAM_UNAVAILABLE',
        message: 'upstream failed',
        statusCode: 503,
      })
    })
    renderPage(ORDER, { initiatePayment })
    fireEvent.click(await screen.findByRole('button', { name: /پرداخت با زرین‌پال/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/درگاه پرداخت موقتاً در دسترس نیست/)
    expect(screen.getByRole('button', { name: /پرداخت با زرین‌پال/ })).toBeEnabled()
  })
  it('shows success only when both server order and payment are paid', async () => {
    renderPage({
      ...ORDER,
      status: 'PAID',
      payment: { latestStatus: 'PAID', attemptCount: 1 },
      payments: [
        {
          id: 'payment-1',
          status: 'PAID',
          amount: ORDER.totals.total,
          createdAt: ORDER.createdAt,
          updatedAt: ORDER.updatedAt,
        },
      ],
    })
    expect(
      await screen.findByRole('heading', { name: 'پرداخت توسط سرور تأیید شد' }),
    ).toBeInTheDocument()
  })

  it('does not offer a new payment for a cancelled order with a paid attempt', async () => {
    renderPage({
      ...ORDER,
      status: 'CANCELLED',
      payment: { latestStatus: 'PAID', attemptCount: 1 },
    })
    expect(
      await screen.findByRole('heading', { name: 'وضعیت پرداخت نیازمند بررسی است' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /پرداخت با زرین‌پال/ })).not.toBeInTheDocument()
  })

  it('does not start another payment when a paid attempt conflicts with a pending order', async () => {
    const initiatePayment = vi.fn()
    renderPage({
      ...ORDER,
      payment: { latestStatus: 'PAID', attemptCount: 1 },
    }, { initiatePayment })
    expect(
      await screen.findByRole('heading', { name: 'وضعیت پرداخت نیازمند بررسی است' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /پرداخت با زرین‌پال/ })).not.toBeInTheDocument()
    expect(initiatePayment).not.toHaveBeenCalled()
  })
})
