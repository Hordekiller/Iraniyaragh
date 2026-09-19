import { createContext, useContext } from 'react'
import type { CommerceApi } from '../services/commerce/types'
import { CartContext } from './cart-context'

export type OrderContextValue = {
  orders: CommerceApi
}

export const OrderContext = createContext<OrderContextValue | null>(null)

export function useOrders(): OrderContextValue {
  const ctx = useContext(OrderContext)
  if (!ctx) throw new Error('useOrders must be used within OrderProvider')
  return ctx
}

export function useOrderApi(): CommerceApi {
  const override = useContext(OrderContext)
  const cart = useContext(CartContext)
  const api = override?.orders ?? cart?.api
  if (!api)
    throw new Error(
      'useOrderApi must be used within CartProvider or OrderProvider',
    )
  return api
}
