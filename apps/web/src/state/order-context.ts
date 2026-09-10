import { createContext, useContext } from 'react'
import type { OrderApi } from '../services/cart/types'

export type OrderContextValue = {
  orders: OrderApi
}

export const OrderContext = createContext<OrderContextValue | null>(null)

export function useOrders(): OrderContextValue {
  const ctx = useContext(OrderContext)
  if (!ctx) throw new Error('useOrders must be used within OrderProvider')
  return ctx
}

export function useOrderApi(): OrderApi {
  return useOrders().orders
}
