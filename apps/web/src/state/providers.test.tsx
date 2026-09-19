import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AuthProvider } from './AuthProvider'
import { CartProvider } from './CartProvider'
import { useAuth } from './auth-context'
import { useCart } from './cart-context'
import {
  CART,
  commerceStub,
  signedInStore,
  testAuthProps,
} from '../test/commerce'

function Probe() {
  const auth = useAuth()
  const cart = useCart()
  return (
    <div>
      <span data-testid="phase">{auth.state.phase}</span>
      <span data-testid="lines">{cart.state.cart.lines.length}</span>
      <button onClick={() => void cart.setQuantity('variant-1', 3)}>set</button>
    </div>
  )
}

describe('commerce providers', () => {
  it('loads and mutates the authenticated server cart', async () => {
    const setLine = vi.fn(async () => ({
      ...CART,
      lines: [{ ...CART.lines[0], quantity: 3 }],
    }))
    const store = signedInStore()
    render(
      <AuthProvider {...testAuthProps(store)}>
        <CartProvider api={commerceStub({ setLine })}>
          <Probe />
        </CartProvider>
      </AuthProvider>,
    )
    await waitFor(() =>
      expect(screen.getByTestId('lines')).toHaveTextContent('1'),
    )
    fireEvent.click(screen.getByRole('button', { name: 'set' }))
    await waitFor(() => expect(setLine).toHaveBeenCalledTimes(1))
  })
  it('throws when cart context is missing', () => {
    function Bad() {
      useCart()
      return null
    }
    expect(() => render(<Bad />)).toThrow(
      'useCart must be used within CartProvider',
    )
  })
})
