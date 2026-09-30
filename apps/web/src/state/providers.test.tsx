import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AuthProvider } from './AuthProvider'
import { AuthFixtureClient } from '../lib/auth/fixtures'
import { MemorySessionStore } from '../lib/auth/session-store'
import { CartProvider } from './CartProvider'
import { useAuth } from './auth-context'
import { useCart } from './cart-context'
import { useCatalog } from './catalog-context'
import { useCommerce } from '../services/commerce/context'
import { useToast } from '../components/feedback/toast-context'
import type { CartLine } from '../services/cart/types'
import type { CartStorage } from '../services/cart/controller'

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

class MemoryCartStorage implements CartStorage {
  state = { lines: [] as CartLine[] }
  read() {
    return { lines: this.state.lines.map(l => ({ ...l })) }
  }
  write(next: { lines: CartLine[] }) {
    this.state = { lines: next.lines.map(l => ({ ...l })) }
  }
}

function Probe() {
  const auth = useAuth()
  const cart = useCart()
  return (
    <div>
      <span data-testid="auth-phase">{auth.state.phase}</span>
      <span data-testid="cart-lines">{cart.state.lines.length}</span>
      <span data-testid="totals-itemcount">{cart.totals.itemCount}</span>
      <button onClick={() => cart.add(LINE)}>add</button>
      <button onClick={() => cart.setQuantity('v1', 3)}>set3</button>
      <button onClick={() => cart.remove('v1')}>remove</button>
      <button onClick={() => cart.clear()}>clear</button>
      <span data-testid="in-cart">{String(cart.isInCart('v1'))}</span>
      <span data-testid="qty">{cart.quantityOf('v1')}</span>
    </div>
  )
}

function renderCart() {
  return render(
    <AuthProvider api={new AuthFixtureClient({ store: new MemorySessionStore() })}>
      <CartProvider storage={new MemoryCartStorage()}>
        <Probe />
      </CartProvider>
    </AuthProvider>,
  )
}

function expectThrow(renderFn: () => void, message: string) {
  expect(renderFn).toThrow(message)
}

describe('context guards', () => {
  it('useAuth throws outside AuthProvider', () => {
    function Bad() {
      useAuth()
      return null
    }
    expectThrow(() => render(<Bad />), 'useAuth must be used within AuthProvider')
  })

  it('useCart throws outside CartProvider', () => {
    function Bad() {
      useCart()
      return null
    }
    expectThrow(() => render(<Bad />), 'useCart must be used within CartProvider')
  })

  it('useCatalog throws outside CatalogProvider', () => {
    function Bad() {
      useCatalog()
      return null
    }
    expectThrow(() => render(<Bad />), 'useCatalog must be used within CatalogProvider')
  })

  it('useCommerce throws outside CommerceProvider', () => {
    function Bad() {
      useCommerce()
      return null
    }
    expectThrow(() => render(<Bad />), 'useCommerce must be used within CommerceProvider')
  })

  it('useToast throws outside ToastProvider', () => {
    function Bad() {
      useToast()
      return null
    }
    expectThrow(() => render(<Bad />), 'useToast must be used within ToastProvider')
  })

  it('CartProvider throws without an AuthProvider above it', () => {
    expectThrow(
      () => render(<CartProvider storage={new MemoryCartStorage()}><span>x</span></CartProvider>),
      'useAuth must be used within AuthProvider',
    )
  })

  it('CartProvider provides working cart operations through the context', () => {
    renderCart()

    fireEvent.click(screen.getByRole('button', { name: 'add' }))
    expect(screen.getByTestId('cart-lines')).toHaveTextContent('1')
    expect(screen.getByTestId('in-cart')).toHaveTextContent('true')
    expect(screen.getByTestId('qty')).toHaveTextContent('1')
    expect(screen.getByTestId('totals-itemcount')).toHaveTextContent('1')

    fireEvent.click(screen.getByRole('button', { name: 'set3' }))
    expect(screen.getByTestId('qty')).toHaveTextContent('3')

    fireEvent.click(screen.getByRole('button', { name: 'remove' }))
    expect(screen.getByTestId('cart-lines')).toHaveTextContent('0')

    fireEvent.click(screen.getByRole('button', { name: 'add' }))
    expect(screen.getByTestId('cart-lines')).toHaveTextContent('1')

    fireEvent.click(screen.getByRole('button', { name: 'clear' }))
    expect(screen.getByTestId('cart-lines')).toHaveTextContent('0')
  })
})