import { createContext, useContext } from 'react'
import type { CartView } from '@iranyaragh/contracts'
import type { CartController } from '../services/cart/controller'
import type { CartLine, CartState, CartTotals } from '../services/cart/types'

export type CartContextValue = {
  state: CartState
  controller: CartController
  totals: CartTotals
  add: (line: CartLine) => void
  setQuantity: (variantId: string, quantity: number) => void
  remove: (variantId: string) => void
  clear: () => void
  isInCart: (variantId: string) => boolean
  quantityOf: (variantId: string) => number
  /** 'server' when the merchant cart is authoritative; 'draft' for guest state. */
  source: 'draft' | 'server'
  /** True while the server cart is being loaded/refreshed. */
  loading: boolean
  /** Server-reported error message, null when healthy. */
  error: string | null
  /** Raw server cart view (null while in draft or before the first load). */
  serverCart: CartView | null
  /** Re-read the server cart (e.g. after checkout frees the cart). */
  refresh: () => Promise<void>
}

export const CartContext = createContext<CartContextValue | null>(null)

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used within CartProvider')
  return ctx
}