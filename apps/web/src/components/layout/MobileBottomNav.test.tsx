import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MobileBottomNav } from './MobileBottomNav'
import { ToastProvider } from '../feedback/Toast'
import { ROUTES } from '../../lib/routes'
import { AuthProvider } from '../../state/AuthProvider'
import { CartProvider } from '../../state/CartProvider'
import type { CartStorage } from '../../services/cart/controller'
import type { CartLine, CartState } from '../../services/cart/types'

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
  quantity: 1,
  available: null,
}

function Harness({
  onOpenSearch = vi.fn(),
  onOpenLogin = vi.fn(),
  storage = new MemoryCartStorage([]),
}: {
  onOpenSearch?: () => void
  onOpenLogin?: () => void
  storage?: CartStorage
}) {
  return (
    <ToastProvider>
      <AuthProvider>
        <CartProvider storage={storage}>
          <MobileBottomNav onOpenSearch={onOpenSearch} onOpenLogin={onOpenLogin} />
          <RouteProbe />
        </CartProvider>
      </AuthProvider>
    </ToastProvider>
  )
}

function RouteProbe() {
  const { pathname } = useLocation()
  return <span data-testid="current-path">{pathname}</span>
}

describe('MobileBottomNav', () => {
  beforeEach(() => {
    window.scrollTo = vi.fn()
  })

  it('is exposed as a labelled navigation landmark', () => {
    render(
      <MemoryRouter>
        <Harness />
      </MemoryRouter>,
    )
    expect(screen.getByRole('navigation', { name: 'ناوبری پایین' })).toBeInTheDocument()
  })

  it('triggers the search opener', () => {
    const onOpenSearch = vi.fn()
    render(
      <MemoryRouter>
        <Harness onOpenSearch={onOpenSearch} />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'جستجو' }))

    expect(onOpenSearch).toHaveBeenCalledTimes(1)
  })

  it('opens login from the profile button for a guest', () => {
    const onOpenLogin = vi.fn()
    render(
      <MemoryRouter initialEntries={[ROUTES.home]}>
        <Harness onOpenLogin={onOpenLogin} />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'حساب کاربری' }))

    expect(onOpenLogin).toHaveBeenCalledTimes(1)
  })

  it('links home to the home route', () => {
    render(
      <MemoryRouter initialEntries={['/elsewhere']}>
        <Harness />
      </MemoryRouter>,
    )

    const home = screen.getByRole('link', { name: /خانه/ })
    expect(home).toHaveAttribute('href', ROUTES.home)

    fireEvent.click(home)
    expect(screen.getByTestId('current-path')).toHaveTextContent(ROUTES.home)
  })

  it('links categories to the real categories page, not a home scroll anchor', () => {
    render(
      <MemoryRouter initialEntries={['/elsewhere']}>
        <Harness />
      </MemoryRouter>,
    )

    const categories = screen.getByRole('link', { name: 'دسته‌بندی‌ها' })
    expect(categories).toHaveAttribute('href', ROUTES.categories)

    fireEvent.click(categories)
    expect(screen.getByTestId('current-path')).toHaveTextContent(ROUTES.categories)
  })

  it('marks the current destination as active and leaves the others inactive', () => {
    render(
      <MemoryRouter initialEntries={[ROUTES.categories]}>
        <Harness />
      </MemoryRouter>,
    )

    const active = screen.getByRole('link', { name: 'دسته‌بندی‌ها' })
    const inactive = screen.getByRole('link', { name: 'خانه' })
    expect(active.className).toContain('text-[#6842ff]')
    // An always-on active colour told the customer they were on every page.
    expect(inactive.className).toContain('text-slate-600')
    expect(inactive.className).not.toContain('text-[#6842ff]')
  })

  it('offers the order history as a real route', () => {
    render(
      <MemoryRouter initialEntries={['/elsewhere']}>
        <Harness />
      </MemoryRouter>,
    )

    const orders = screen.getByRole('link', { name: 'پیگیری سفارش' })
    expect(orders).toHaveAttribute('href', ROUTES.orders)
    fireEvent.click(orders)
    expect(screen.getByTestId('current-path')).toHaveTextContent(ROUTES.orders)
  })

  it('does not duplicate the header cart in the bottom bar', () => {
    render(
      <MemoryRouter>
        <Harness storage={new MemoryCartStorage([LINE])} />
      </MemoryRouter>,
    )

    // The header already carries the cart on every viewport.
    const bottom = screen.getByRole('navigation', { name: 'ناوبری پایین' })
    expect(within(bottom).queryByRole('link', { name: /سبد خرید/ })).not.toBeInTheDocument()
  })

  it('reserves the iOS home-indicator inset so the last item stays reachable', () => {
    render(
      <MemoryRouter>
        <Harness />
      </MemoryRouter>,
    )

    const nav = screen.getByRole('navigation', { name: 'ناوبری پایین' })
    const bar = nav.firstElementChild as HTMLElement
    expect(bar.className).toContain('safe-area-inset-bottom')
  })
})
