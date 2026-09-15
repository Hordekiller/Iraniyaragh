import { createContext, useContext } from 'react'
import type { CartController } from '../services/cart/controller'
import type { CartLine, CartState, CartTotals } from '../services/cart/types'

export type CartContextValue = {
  state: CartState
  controller: CartController
  totals: CartTotals
  add: (line: CartLine) => void
  setQuantity: (productId: string, quantity: number) => void
  remove: (productId: string) => void
  clear: () => void
  isInCart: (productId: string) => boolean
  quantityOf: (productId: string) => number
}

export const CartContext = createContext<CartContextValue | null>(null)

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used within CartProvider')
  return ctx
}
