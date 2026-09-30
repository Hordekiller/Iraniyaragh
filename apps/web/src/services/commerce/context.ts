import { createContext, useContext } from 'react'
import type { CheckoutApi } from './checkout'
import type { StoreCartApi } from './cart'
import type { OrdersApi } from './orders'

export type CommerceApi = {
  cart: StoreCartApi
  checkout: CheckoutApi
  orders: OrdersApi
}

export const CommerceContext = createContext<CommerceApi | null>(null)

export function useCommerce(): CommerceApi {
  const ctx = useContext(CommerceContext)
  if (!ctx) throw new Error('useCommerce must be used within CommerceProvider')
  return ctx
}

/** Read-only access so components can degrade gracefully when the provider is absent (tests). */
export function useOptionalCommerce(): CommerceApi | null {
  return useContext(CommerceContext)
}