import { createContext, useContext } from 'react'
import type { CommerceApi, CommerceCartState } from '../services/commerce/types'

export type CartContextValue = {
  state: CommerceCartState
  api: CommerceApi
  reload: () => Promise<void>
  add: (variantId: string, quantity?: number) => Promise<boolean>
  setQuantity: (variantId: string, quantity: number) => Promise<void>
  remove: (variantId: string) => Promise<void>
  clear: () => Promise<void>
  isInCart: (variantId: string) => boolean
  quantityOf: (variantId: string) => number
}

export const CartContext = createContext<CartContextValue | null>(null)

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used within CartProvider')
  return ctx
}
