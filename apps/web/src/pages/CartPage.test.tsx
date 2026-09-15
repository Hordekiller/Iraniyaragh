import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { MemorySessionStore } from '../lib/auth/session-store'
import { AuthFixtureClient } from '../lib/auth/fixtures'
import { AuthProvider } from '../state/AuthProvider'
import { CartProvider } from '../state/CartProvider'
import { ToastProvider } from '../components/feedback/Toast'
import type { CartLine, CartState } from '../services/cart/types'
import type { CartStorage } from '../services/cart/controller'
import { CartPage } from './CartPage'

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
  quantity: 2,
}

function renderCart(storage: CartStorage) {
  return render(
    <MemoryRouter initialEntries={['/cart']}>
      <Routes>
        <Route
          path="/cart"
          element={
            <ToastProvider>
              <AuthProvider api={new AuthFixtureClient({ store: new MemorySessionStore() })}>
                <CartProvider storage={storage}>
                  <CartPage />
                </CartProvider>
              </AuthProvider>
            </ToastProvider>
          }
        />
      </Routes>
    </MemoryRouter>,
  )
}

describe('CartPage', () => {
  it('shows the empty-cart state with a back-to-store link', () => {
    renderCart(new MemoryCartStorage([]))

    expect(screen.getByRole('heading', { name: 'سبد خرید شما خالی است' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'بازگشت به فروشگاه' })).toHaveAttribute('href', '/')
  })

  it('renders lines, quantities and order summary', () => {
    renderCart(new MemoryCartStorage([LINE]))

    expect(screen.getByRole('heading', { name: /سبد خرید/ })).toBeInTheDocument()
    const links = screen.getAllByRole('link', { name: 'دریل رونیکس ۲۲۱۰' })
    expect(links.length).toBeGreaterThanOrEqual(2)
    links.forEach(l => expect(l).toHaveAttribute('href', '/product/ronix-2210-hammer-drill'))
    expect(screen.getByText('۲')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'ادامه فرایند خرید' })).toHaveAttribute('href', '/checkout')
    expect(screen.getByRole('link', { name: 'ادامه خرید' })).toHaveAttribute('href', '/')
  })

  it('increments and decrements the line quantity from the stepper', () => {
    const storage = new MemoryCartStorage([LINE])
    renderCart(storage)

    fireEvent.click(screen.getByRole('button', { name: 'افزایش تعداد دریل رونیکس ۲۲۱۰' }))
    expect(storage.state.lines[0].quantity).toBe(3)

    fireEvent.click(screen.getByRole('button', { name: 'کاهش تعداد دریل رونیکس ۲۲۱۰' }))
    expect(storage.state.lines[0].quantity).toBe(2)
  })

  it('removes a line from the remove action', () => {
    const storage = new MemoryCartStorage([LINE])
    renderCart(storage)

    fireEvent.click(screen.getByRole('button', { name: 'حذف دریل رونیکس ۲۲۱۰' }))

    expect(storage.state.lines).toHaveLength(0)
    expect(screen.getByRole('heading', { name: 'سبد خرید شما خالی است' })).toBeInTheDocument()
  })

  it('clears the whole cart and notifies the user', () => {
    const storage = new MemoryCartStorage([LINE])
    renderCart(storage)

    fireEvent.click(screen.getByRole('button', { name: 'حذف همه' }))

    expect(storage.state.lines).toHaveLength(0)
    expect(screen.getByRole('status')).toHaveTextContent('سبد خرید خالی شد')
  })

  it('shows free shipping above the threshold and metered shipping below it', () => {
    const bigLine: CartLine = { ...LINE, quantity: 8, unitPrice: { amount: '28500000', currency: 'IRR' } }
    renderCart(new MemoryCartStorage([bigLine]))

    expect(screen.getAllByText('رایگان').length).toBeGreaterThan(0)
  })

  it('shows the metered shipping cost for an under-threshold subtotal', () => {
    const small: CartLine = { ...LINE, quantity: 1, unitPrice: { amount: '1000000', currency: 'IRR' } }
    renderCart(new MemoryCartStorage([small]))

    expect(screen.getByText('۴۵٬۰۰۰ تومان')).toBeInTheDocument()
  })
})