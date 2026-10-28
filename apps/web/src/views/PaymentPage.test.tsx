import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthApiError } from '../lib/auth/errors'
import { AuthProvider } from '../state/AuthProvider'
import { OrderProvider } from '../state/OrderProvider'
import {
  ORDER,
  commerceStub,
  signedInStore,
  testAuthProps,
  testAuthContext,
} from '../test/commerce'
import { PaymentPage } from './PaymentPage'
import { AuthContext, type AuthContextValue } from '../state/auth-context'
import type { CommerceApi } from '../services/commerce/types'

function sessionPage(auth: AuthContextValue, api: CommerceApi) {
  return <MemoryRouter initialEntries={['/payment/order-1']}><AuthContext.Provider value={auth}><OrderProvider api={api}><Routes><Route path="/payment/:id" element={<PaymentPage />} /></Routes></OrderProvider></AuthContext.Provider></MemoryRouter>
}

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
  const currentTime = new Date('2026-09-19T10:01:00.000Z')
  beforeEach(() => {
    gateway.redirect.mockReset()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(currentTime)
  })
  afterEach(() => vi.useRealTimers())

  it('clears the previous customer order when the principal changes without an anonymous render', async () => {
    const auth = testAuthContext()
    const api = commerceStub({ getOrder: vi.fn().mockResolvedValueOnce(ORDER).mockRejectedValue(new AuthApiError({ code: 'ORDER_NOT_FOUND', statusCode: 404, message: 'not owned' })) })
    const page = render(sessionPage(auth, api))
    await screen.findByText(/سفارش IR-0001/)
    page.rerender(sessionPage({ ...auth, identityVersion: auth.identityVersion + 1, state: { ...auth.state, principal: { ...auth.state.principal!, userId: 'other-customer' } } }, api))
    expect(screen.queryByText(/سفارش IR-0001/)).not.toBeInTheDocument()
    await screen.findByRole('heading', { name: 'وضعیت پرداخت دریافت نشد' })
    expect(api.getOrder).toHaveBeenCalledTimes(2)
  })

  it('preserves an unconfirmed attempt through normal token/session rotation', async () => {
    const auth = testAuthContext()
    const api = commerceStub({ initiatePayment: vi.fn().mockRejectedValue(new AuthApiError({ code: 'PAYMENT_RESULT_UNCONFIRMED', statusCode: 503, message: 'pending' })) })
    const page = render(sessionPage(auth, api))
    fireEvent.click(await screen.findByRole('button', { name: /پرداخت با زرین‌پال/ }))
    await screen.findByRole('alert')
    page.rerender(sessionPage({ ...auth, state: { ...auth.state, principal: { ...auth.state.principal!, sessionId: 'rotated-session' } } }, api))
    expect(screen.queryByRole('button', { name: /پرداخت با زرین‌پال/ })).not.toBeInTheDocument()
    expect(api.initiatePayment).toHaveBeenCalledOnce()
  })

  it('does not redirect a new customer from a previous customer late initiation', async () => {
    const auth = testAuthContext()
    let finish!: (value: Awaited<ReturnType<CommerceApi['initiatePayment']>>) => void
    const api = commerceStub({ initiatePayment: vi.fn(() => new Promise<Awaited<ReturnType<CommerceApi['initiatePayment']>>>((resolve) => { finish = resolve })) })
    const page = render(sessionPage(auth, api))
    fireEvent.click(await screen.findByRole('button', { name: /پرداخت با زرین‌پال/ }))
    page.rerender(sessionPage({ ...auth, identityVersion: auth.identityVersion + 1, state: { ...auth.state, principal: { ...auth.state.principal!, userId: 'other-customer' } } }, api))
    await act(async () => finish({ paymentId: 'p', status: 'PENDING', provider: 'zarinpal', amount: ORDER.totals.total, authority: 'A1', redirectUrl: 'https://payment.zarinpal.com/pg/StartPay/A1' }))
    expect(gateway.redirect).not.toHaveBeenCalled()
  })

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

  it('blocks a new payment at the exact reservation deadline without cancelling the order', async () => {
    vi.setSystemTime(new Date(ORDER.reservationExpiresAt))
    const initiatePayment = vi.fn()
    const cancelOrder = vi.fn()
    renderPage(ORDER, { initiatePayment, cancelOrder })
    expect(await screen.findByRole('heading', { name: 'مهلت پرداخت این سفارش به پایان رسیده است' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /پرداخت با زرین‌پال/ })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'جزئیات سفارش' })).toHaveAttribute('href', '/orders/order-1')
    expect(initiatePayment).not.toHaveBeenCalled()
    expect(cancelOrder).not.toHaveBeenCalled()
    expect(gateway.redirect).not.toHaveBeenCalled()
  })

  it('removes the payment action when the deadline passes while the page is idle', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
    vi.setSystemTime(currentTime)
    const api = commerceStub({ getOrder: vi.fn().mockResolvedValue(ORDER), initiatePayment: vi.fn() })
    await act(async () => { render(sessionPage(testAuthContext(), api)) })
    expect(screen.getByRole('button', { name: /پرداخت با زرین‌پال/ })).toBeInTheDocument()
    await act(async () => { await vi.advanceTimersByTimeAsync(Date.parse(ORDER.reservationExpiresAt) - currentTime.getTime()) })
    expect(screen.getByRole('heading', { name: 'مهلت پرداخت این سفارش به پایان رسیده است' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /پرداخت با زرین‌پال/ })).not.toBeInTheDocument()
    expect(api.getOrder).toHaveBeenCalledOnce()
    expect(api.initiatePayment).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('rechecks the deadline on click even when the suspended tab has not run its timer', async () => {
    const initiatePayment = vi.fn()
    renderPage(ORDER, { initiatePayment })
    const button = await screen.findByRole('button', { name: /پرداخت با زرین‌پال/ })
    vi.setSystemTime(new Date(ORDER.reservationExpiresAt))
    fireEvent.click(button)
    expect(screen.getByRole('heading', { name: 'مهلت پرداخت این سفارش به پایان رسیده است' })).toBeInTheDocument()
    expect(initiatePayment).not.toHaveBeenCalled()
    expect(gateway.redirect).not.toHaveBeenCalled()
  })

  it('refreshes the deadline state when a suspended page regains focus', async () => {
    const initiatePayment = vi.fn()
    renderPage(ORDER, { initiatePayment })
    await screen.findByRole('button', { name: /پرداخت با زرین‌پال/ })
    vi.setSystemTime(new Date(ORDER.reservationExpiresAt))
    fireEvent.focus(window)
    expect(screen.getByRole('heading', { name: 'مهلت پرداخت این سفارش به پایان رسیده است' })).toBeInTheDocument()
    expect(initiatePayment).not.toHaveBeenCalled()
  })

  it('fails closed for a malformed deadline without claiming payment failure', async () => {
    const initiatePayment = vi.fn()
    renderPage({ ...ORDER, reservationExpiresAt: 'invalid-date' }, { initiatePayment })
    expect(await screen.findByRole('heading', { name: 'مهلت پرداخت قابل بررسی نیست' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /پرداخت با زرین‌پال/ })).not.toBeInTheDocument()
    expect(screen.queryByText('پرداخت تأیید نشد')).not.toBeInTheDocument()
    expect(initiatePayment).not.toHaveBeenCalled()
  })

  it('preserves an existing pending attempt across an expired deadline and reload', async () => {
    vi.setSystemTime(new Date(ORDER.reservationExpiresAt))
    const initiatePayment = vi.fn()
    const cancelOrder = vi.fn()
    const getOrder = vi.fn().mockResolvedValue({ ...ORDER, payment: { latestStatus: 'PENDING', attemptCount: 1 } })
    renderPage(ORDER, { getOrder, initiatePayment, cancelOrder }, true)
    await screen.findByRole('heading', { name: 'مهلت پرداخت این سفارش به پایان رسیده است' })
    expect(screen.getByText(/پایان مهلت به معنی ناموفق بودن پرداخت یا بازگشت وجه نیست/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /بررسی دوباره وضعیت/ }))
    await screen.findByRole('heading', { name: 'مهلت پرداخت این سفارش به پایان رسیده است' })
    expect(getOrder).toHaveBeenCalledTimes(2)
    expect(initiatePayment).not.toHaveBeenCalled()
    expect(cancelOrder).not.toHaveBeenCalled()
  })

  it('does not redirect or retry an initiation whose response arrives after expiry', async () => {
    let finish!: (value: Awaited<ReturnType<CommerceApi['initiatePayment']>>) => void
    const initiatePayment = vi.fn(() => new Promise<Awaited<ReturnType<CommerceApi['initiatePayment']>>>((resolve) => { finish = resolve }))
    renderPage(ORDER, { initiatePayment })
    fireEvent.click(await screen.findByRole('button', { name: /پرداخت با زرین‌پال/ }))
    vi.setSystemTime(new Date(ORDER.reservationExpiresAt))
    await act(async () => { finish({ paymentId: 'late-test-payment', status: 'PENDING', provider: 'zarinpal', amount: ORDER.totals.total, authority: 'test-authority', redirectUrl: 'https://payment.zarinpal.com/pg/StartPay/test-authority' }) })
    expect(screen.getByText(/پایان مهلت به معنی ناموفق بودن پرداخت یا بازگشت وجه نیست/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /پرداخت با زرین‌پال/ })).not.toBeInTheDocument()
    expect(initiatePayment).toHaveBeenCalledOnce()
    expect(gateway.redirect).not.toHaveBeenCalled()
  })

  it('retains a locally unconfirmed attempt through expiry and an explicit order refresh', async () => {
    const initiatePayment = vi.fn().mockRejectedValue(new AuthApiError({ code: 'PAYMENT_RESULT_UNCONFIRMED', statusCode: 503, message: 'unknown result' }))
    const getOrder = vi.fn().mockResolvedValue(ORDER)
    renderPage(ORDER, { getOrder, initiatePayment })
    fireEvent.click(await screen.findByRole('button', { name: /پرداخت با زرین‌پال/ }))
    await screen.findByRole('alert')
    vi.setSystemTime(new Date(ORDER.reservationExpiresAt))
    fireEvent.focus(window)
    expect(screen.getByText(/پایان مهلت به معنی ناموفق بودن پرداخت یا بازگشت وجه نیست/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /بررسی دوباره وضعیت/ }))
    await screen.findByRole('heading', { name: 'مهلت پرداخت این سفارش به پایان رسیده است' })
    expect(screen.getByText(/پایان مهلت به معنی ناموفق بودن پرداخت یا بازگشت وجه نیست/)).toBeInTheDocument()
    expect(getOrder).toHaveBeenCalledTimes(2)
    expect(initiatePayment).toHaveBeenCalledOnce()
    expect(gateway.redirect).not.toHaveBeenCalled()
  })

  it('keeps a server-verified paid order successful after its historical deadline', async () => {
    vi.setSystemTime(new Date(ORDER.reservationExpiresAt))
    renderPage({ ...ORDER, status: 'PAID', payment: { latestStatus: 'PAID', attemptCount: 1 } }, {}, true)
    expect(await screen.findByRole('heading', { name: 'پرداخت توسط سرور تأیید شد' })).toBeInTheDocument()
    expect(screen.queryByText('مهلت پرداخت این سفارش به پایان رسیده است')).not.toBeInTheDocument()
  })

  it('shows a cancelled unpaid order without inviting a new payment or inventing a refund', async () => {
    const initiatePayment = vi.fn()
    renderPage({ ...ORDER, status: 'CANCELLED' }, { initiatePayment })
    expect(await screen.findByRole('heading', { name: 'سفارش لغو شده است' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /پرداخت با زرین‌پال/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'پرداخت توسط سرور تأیید شد' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'مشاهده جزئیات سفارش' })).toHaveAttribute('href', '/orders/order-1')
    expect(initiatePayment).not.toHaveBeenCalled()
  })
})
