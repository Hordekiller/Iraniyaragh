import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { MemorySessionStore } from '../lib/auth/session-store'
import { AuthProvider } from '../state/AuthProvider'
import { CartProvider } from '../state/CartProvider'
import {
  CART,
  commerceStub,
  signedInStore,
  testAuthProps,
} from '../test/commerce'
import { CartPage } from './CartPage'

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

describe('CartPage', () => {
  it('renders the server-owned Guest Cart and defers OTP until checkout', async () => {
    const api = commerceStub()
    renderPage(api, new MemorySessionStore())
    expect(
      await screen.findByRole('heading', { name: 'سبد خرید' }),
    ).toBeInTheDocument()
    expect(api.getCart).toHaveBeenCalledWith('guest')
    expect(
      screen.getByRole('button', { name: 'ورود با موبایل و ادامه خرید' }),
    ).toBeInTheDocument()
  })

  it('renders the authoritative server cart and updates quantity through the API', async () => {
    const setLine = vi.fn(
      async (_owner: 'guest' | 'customer', _id: string, quantity: number) => ({
        ...CART,
        lines: [{ ...CART.lines[0], quantity }],
      }),
    )
    const api = commerceStub({ setLine })
    renderPage(api)
    expect(await screen.findByText('دریل رونیکس ۲۲۱۰')).toBeInTheDocument()
    expect(
      screen.getAllByText('۵٬۷۰۰٬۰۰۰ تومان').length,
    ).toBeGreaterThanOrEqual(1)
    fireEvent.click(
      screen.getByRole('button', { name: 'افزایش تعداد دریل رونیکس ۲۲۱۰' }),
    )
    await waitFor(() =>
      expect(setLine).toHaveBeenCalledWith(
        'customer',
        'variant-1',
        3,
        expect.stringMatching(/^cart-/),
      ),
    )
  })

  it('does not let the plus button pass the stock the server reports', async () => {
    const atStock = {
      ...CART,
      lines: [{ ...CART.lines[0], quantity: 5, available: 5 }],
    }
    const api = commerceStub({
      getCart: vi.fn(async () => atStock),
      mergeGuestCart: vi.fn(async () => ({ cart: atStock, warnings: [] })),
    })
    renderPage(api)
    const increment = await screen.findByRole('button', {
      name: 'افزایش تعداد دریل رونیکس ۲۲۱۰',
    })
    expect(increment).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'کاهش تعداد دریل رونیکس ۲۲۱۰' }),
    ).toBeEnabled()
  })

  describe('direct quantity entry', () => {
    const NAME = 'تعداد محصول دریل رونیکس ۲۲۱۰'
    const priced = (quantity: number, available = 2000) => ({
      ...CART,
      lines: [{
        ...CART.lines[0],
        quantity,
        available,
        lineTotal: { amount: String(28500000 * quantity), currency: 'IRR' as const },
      }],
      quote: {
        ...CART.quote,
        subtotal: { amount: String(28500000 * quantity), currency: 'IRR' as const },
        total: { amount: String(28500000 * quantity), currency: 'IRR' as const },
      },
    })
    const stateful = (start: number, available = 2000) => {
      let current = priced(start, available)
      return commerceStub({
        getCart: vi.fn(async () => current),
        mergeGuestCart: vi.fn(async () => ({ cart: current, warnings: [] })),
        setLine: vi.fn(async (_o: 'guest' | 'customer', _id: string, quantity: number) => {
          current = priced(quantity, available)
          return current
        }),
      })
    }
    const enter = (input: HTMLElement, text: string) => {
      input.focus()
      fireEvent.change(input, { target: { value: text } })
      fireEvent.keyDown(input, { key: 'Enter' })
    }

    it('sends 100 as one absolute update and shows the recalculated server price', async () => {
      const api = stateful(2)
      renderPage(api)
      enter(await screen.findByRole('textbox', { name: NAME }), '100')
      await waitFor(() => expect(api.setLine).toHaveBeenCalledOnce())
      expect(api.setLine).toHaveBeenCalledWith('customer', 'variant-1', 100, expect.stringMatching(/^cart-/))
      expect(api.addLine).not.toHaveBeenCalled()
      await waitFor(() =>
        expect(screen.getAllByText('۲۸۵٬۰۰۰٬۰۰۰ تومان').length).toBeGreaterThanOrEqual(2),
      )
    })

    it('never sends a quantity above the available stock', async () => {
      const api = stateful(2, 40)
      renderPage(api)
      enter(await screen.findByRole('textbox', { name: NAME }), '100')
      await waitFor(() => expect(api.setLine).toHaveBeenCalledOnce())
      expect(vi.mocked(api.setLine).mock.calls[0]?.[2]).toBe(40)
      expect(await screen.findByText(/فقط ۴۰ عدد از این کالا قابل سفارش است/)).toBeInTheDocument()
    })

    it('keeps the confirmed quantity and offers a retry after a network failure', async () => {
      const api = stateful(2)
      vi.mocked(api.setLine).mockRejectedValueOnce(new Error('network'))
      renderPage(api)
      const input = await screen.findByRole('textbox', { name: NAME })
      enter(input, '100')
      expect(await screen.findByText(/ثبت تعداد ۱۰۰ انجام نشد/)).toBeInTheDocument()
      expect(input).toHaveValue('۲')
      fireEvent.click(screen.getByRole('button', { name: 'تلاش دوباره' }))
      await waitFor(() => expect(input).toHaveValue('۱۰۰'))
    })

    it('blocks continuing to checkout while a line exceeds stock', async () => {
      renderPage(stateful(10, 4))
      expect(await screen.findByText(/بیشتر از موجودی قابل سفارش است/)).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'ادامه فرایند خرید' })).toHaveAttribute('aria-disabled', 'true')
    })
  })

  it('announces deterministic merge warnings without exposing internal identifiers', async () => {
    const api = commerceStub({
      mergeGuestCart: vi.fn(async () => ({
        cart: CART,
        warnings: [
          { variantId: 'variant-1', code: 'QUANTITY_CAPPED' as const },
          {
            variantId: 'internal-variant-2',
            code: 'LINE_LIMIT_REACHED' as const,
          },
        ],
      })),
    })

    renderPage(api)

    const warningTitle = await screen.findByText(/سبدها ادغام شدند/)
    const status = warningTitle.closest('[role="status"]')
    expect(status).toHaveTextContent(
      'تعداد یکی از کالاهای مشترک به سقف ۱۰۰۰ عدد رسید',
    )
    expect(status).toHaveTextContent('به‌دلیل سقف ۱۰۰ ردیف')
    expect(screen.queryByText('internal-variant-2')).not.toBeInTheDocument()
  })
})
