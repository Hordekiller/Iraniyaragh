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

  it('treats availability as informational and enforces only the 99-unit Cart cap', async () => {
    const api = commerceStub({
      mergeGuestCart: vi.fn(async () => ({
        cart: {
          ...CART,
          lines: [{ ...CART.lines[0], quantity: 5, available: 5 }],
        },
        warnings: [],
      })),
    })
    renderPage(api)
    const increment = await screen.findByRole('button', {
      name: 'افزایش تعداد دریل رونیکس ۲۲۱۰',
    })
    expect(increment).toBeEnabled()
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
      'تعداد یکی از کالاهای مشترک به سقف ۹۹ عدد رسید',
    )
    expect(status).toHaveTextContent('به‌دلیل سقف ۱۰۰ ردیف')
    expect(screen.queryByText('internal-variant-2')).not.toBeInTheDocument()
  })
})
