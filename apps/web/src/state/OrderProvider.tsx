import { useMemo } from 'react'
import type { ReactNode } from 'react'
import { OrderFixture, LocalOrderStore } from '../services/cart/order-fixtures'
import type { OrderStore } from '../services/cart/order-fixtures'
import type { OrderApi } from '../services/cart/types'
import { OrderContext } from './order-context'
import { useAuth } from './auth-context'

/**
 * Provides the demo order port for the checkout/payment flow.
 *
 * Uses the fixture client persisted to localStorage so a refreshed session keeps
 * its order history. Gated fail-closed: the fixture order flow is only available
 * when an explicit `VITE_FIXTURE_CATALOG=true` opt-in is supplied (or a real
 * `OrderApi` is injected), mirroring the catalog/auth fixture policy. Replace
 * with the real order/payment client when the backend lands.
 */
const fixtureOrdersEnabled = import.meta.env.VITE_FIXTURE_CATALOG === 'true'

export function OrderProvider({
  children,
  api,
  store,
}: {
  children: ReactNode
  api?: OrderApi
  store?: OrderStore
}) {
  const { state: authState } = useAuth()
  const ownerKey = authState.principal?.userId ?? 'guest'
  const value = useMemo(() => {
    if (!api && !fixtureOrdersEnabled) {
      throw new Error(
        'OrderProvider: the fixture order client is not enabled in this build. ' +
          'Wire a real OrderApi or set VITE_FIXTURE_CATALOG=true for local dev/e2e only.',
      )
    }
    return {
      orders: api ?? new OrderFixture(store ?? new LocalOrderStore(`iranyaragh.orders.v1.${ownerKey}`)),
    }
  }, [api, ownerKey, store])

  return <OrderContext.Provider value={value}>{children}</OrderContext.Provider>
}
