import type { ReactNode } from 'react'
import type { CommerceApi } from '../services/commerce/types'
import { OrderContext } from './order-context'

/** Optional test/story override. Production commerce uses the API owned by CartProvider. */
export function OrderProvider({
  children,
  api,
}: {
  children: ReactNode
  api?: CommerceApi
}) {
  if (!api) return children
  return (
    <OrderContext.Provider value={{ orders: api }}>
      {children}
    </OrderContext.Provider>
  )
}
