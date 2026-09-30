import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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
  variantId: 'v1',
  productId: 'p1',
  slug: 'ronix-2210-hammer-drill',
  name: 'دریل رونیکس ۲۲۱۰',
  brand: 'Ronix',
  image: '/images/hero1.jpg',
  sku: 'SKU-2210',
  unitPrice: { amount: '28500000', currency: 'IRR' },
  oldPrice: null,
  quantity: 2,
  available: null,
}

function renderCart(storage: CartStorage, options: { store?: MemorySessionStore } = {}) {
  return render(
    <MemoryRouter initialEntries={['/cart']}>
      <Routes>
        <Route
          path="/cart"
          element={
            <ToastProvider>
              <AuthProvider
                api={new AuthFixtureClient({ store: options.store ?? new MemorySessionStore() })}
                store={options.store}
              >
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

async function signInSession(store: MemorySessionStore) {
  const { CustomerOtpController } = await import('../lib/auth/ui')
  const controller = new CustomerOtpController(new AuthFixtureClient({ store }), store, () => Date.now())
  controller.open()
  controller.setMobile('09123456789')
  await controller.requestOtp()
  controller.setCode('123456')
  await controller.verifyOtp()
}

describe('CartPage', () => {
  it('shows the empty-cart state with real shopping destinations', () => {
    renderCart(new MemoryCartStorage([]))

    expect(screen.getByRole('heading', { name: 'سبد خرید شما خالی است' })).toBeInTheDocument()
    // A dead "back home" button is not a recovery path on mobile.
    expect(screen.getByRole('link', { name: 'مشاهدهٔ کالاها' })).toHaveAttribute('href', '/products')
    expect(screen.getByRole('link', { name: 'مرور دسته‌بندی‌ها' })).toHaveAttribute('href', '/categories')
    expect(screen.getByRole('link', { name: 'تازه‌های فروشگاه' })).toHaveAttribute('href', '/newest')
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
    fireEvent.click(screen.getByRole('button', { name: 'بله، حذف کن' }))

    expect(storage.state.lines).toHaveLength(0)
    expect(screen.getByRole('status')).toHaveTextContent('سبد خرید خالی شد')
  })

  it('requires a confirmation before destroying every line', () => {
    const storage = new MemoryCartStorage([LINE])
    renderCart(storage)

    fireEvent.click(screen.getByRole('button', { name: 'حذف همه' }))
    // One tap must never wipe a filled cart.
    expect(storage.state.lines).toHaveLength(1)

    fireEvent.click(screen.getByRole('button', { name: 'انصراف' }))
    expect(storage.state.lines).toHaveLength(1)
    expect(screen.queryByRole('button', { name: 'بله، حذف کن' })).not.toBeInTheDocument()
  })

  it('announces the confirmation and hands focus back to the trigger', async () => {
    renderCart(new MemoryCartStorage([LINE]))

    const trigger = screen.getByRole('button', { name: 'حذف همه' })
    fireEvent.click(trigger)

    // Opening a confirmation must not leave focus on the now-hidden trigger.
    const prompt = screen.getByRole('alertdialog')
    expect(prompt).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'بله، حذف کن' })).toHaveFocus()

    fireEvent.click(screen.getByRole('button', { name: 'انصراف' }))
    await waitFor(() => expect(trigger).toHaveFocus())
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('cancels the clear confirmation on Escape without touching the cart', async () => {
    const storage = new MemoryCartStorage([LINE])
    renderCart(storage)

    const trigger = screen.getByRole('button', { name: 'حذف همه' })
    fireEvent.click(trigger)
    fireEvent.keyDown(document, { key: 'Escape' })

    await waitFor(() => expect(trigger).toHaveFocus())
    expect(storage.state.lines).toHaveLength(1)
  })

  it('keeps the quantity stepper at an accessible touch size', () => {
    renderCart(new MemoryCartStorage([LINE]))

    const increase = screen.getByRole('button', { name: /افزایش تعداد/ })
    expect(increase.className).toContain('w-11')
    expect(increase.className).toContain('h-11')
  })

  it('announces the item count in a live region', () => {
    renderCart(new MemoryCartStorage([LINE]))

    const status = screen.getAllByRole('status').find(node => node.textContent?.includes('در سبد خرید'))
    expect(status).toBeDefined()
    expect(status).toHaveAttribute('aria-live', 'polite')
  })

  it('never states a shipping fee for a guest draft that has no server quote', () => {
    const small: CartLine = { ...LINE, quantity: 1, unitPrice: { amount: '1000000', currency: 'IRR' } }
    renderCart(new MemoryCartStorage([small]))

    expect(screen.getByText('در تسویه‌حساب محاسبه می‌شود')).toBeInTheDocument()
    expect(screen.queryByText('رایگان')).not.toBeInTheDocument()
  })

  it('labels the draft total as a goods subtotal, not a final payable amount', () => {
    const small: CartLine = { ...LINE, quantity: 1, unitPrice: { amount: '1000000', currency: 'IRR' } }
    renderCart(new MemoryCartStorage([small]))

    expect(screen.getByText('جمع کالاها')).toBeInTheDocument()
    expect(screen.queryByText('مبلغ قابل پرداخت')).not.toBeInTheDocument()
  })

  it('never tells a signed-in customer their cart is empty while the server cart loads', async () => {
    const store = new MemorySessionStore()
    await signInSession(store)
    // A cold signed-in cart starts from an empty in-memory draft, so the first
    // render has no lines at all until the server cart arrives.
    renderCart(new MemoryCartStorage([]), { store })

    expect(screen.queryByRole('heading', { name: 'سبد خرید شما خالی است' })).not.toBeInTheDocument()
    // ...and the draft source must not make a signed-in visitor look like a guest.
    expect(screen.queryByText('برای تکمیل سفارش ابتدا وارد حساب خود شوید.')).not.toBeInTheDocument()

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('در حال بارگذاری سبد خرید'))
  })
})
