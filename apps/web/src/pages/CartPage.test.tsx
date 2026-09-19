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
  it('prompts an anonymous customer instead of using a browser cart', () => {
    const api = commerceStub()
    renderPage(api, new MemorySessionStore())
    expect(
      screen.getByRole('heading', { name: 'برای مشاهده سبد خرید وارد شوید' }),
    ).toBeInTheDocument()
    expect(api.getCart).not.toHaveBeenCalled()
  })

  it('renders the authoritative server cart and updates quantity through the API', async () => {
    const setLine = vi.fn(async (_id: string, quantity: number) => ({
      ...CART,
      lines: [{ ...CART.lines[0], quantity }],
    }))
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
        'variant-1',
        3,
        expect.stringMatching(/^cart-/),
      ),
    )
  })

  it('disables increments at the server-provided availability bound', async () => {
    const api = commerceStub({
      getCart: vi.fn(async () => ({
        ...CART,
        lines: [{ ...CART.lines[0], quantity: 5, available: 5 }],
      })),
    })
    renderPage(api)
    expect(
      await screen.findByRole('button', {
        name: 'افزایش تعداد دریل رونیکس ۲۲۱۰',
      }),
    ).toBeDisabled()
  })
})
