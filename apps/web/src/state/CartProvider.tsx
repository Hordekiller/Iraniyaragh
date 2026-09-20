import { useEffect, useMemo, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { CommerceCartController } from '../services/commerce/controller'
import { CommerceFixtureClient } from '../services/commerce/fixture'
import { CommerceHttpClient } from '../services/commerce/http'
import type { CommerceApi } from '../services/commerce/types'
import { CartContext } from './cart-context'
import { useAuth } from './auth-context'

const fixtureCommerceEnabled = import.meta.env.VITE_FIXTURE_CATALOG === 'true'

export function CartProvider({
  children,
  api,
}: {
  children: ReactNode
  api?: CommerceApi
}) {
  const auth = useAuth()
  const value = useMemo(() => {
    const commerceApi =
      api ??
      (fixtureCommerceEnabled
        ? new CommerceFixtureClient()
        : new CommerceHttpClient(
            auth.request,
            import.meta.env.VITE_API_BASE_URL,
          ))
    return {
      api: commerceApi,
      controller: new CommerceCartController(commerceApi),
    }
    // api and auth.request are stable provider dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const snapshot = useSyncExternalStore(
    value.controller.subscribe,
    value.controller.getState,
    value.controller.getState,
  )

  useEffect(() => {
    value.controller.setAuthenticated(auth.state.phase === 'authenticated')
  }, [auth.state.phase, value.controller])

  const contextValue = useMemo(
    () => ({
      state: snapshot,
      api: value.api,
      reload: () => value.controller.retry(),
      add: (variantId: string, quantity = 1) =>
        value.controller.add(variantId, quantity),
      setQuantity: (variantId: string, quantity: number) =>
        value.controller.setQuantity(variantId, quantity),
      remove: (variantId: string) => value.controller.remove(variantId),
      clear: () => value.controller.clear(),
      isInCart: (variantId: string) =>
        snapshot.cart.lines.some((line) => line.variantId === variantId),
      quantityOf: (variantId: string) =>
        snapshot.cart.lines.find((line) => line.variantId === variantId)
          ?.quantity ?? 0,
    }),
    [snapshot, value],
  )

  return (
    <CartContext.Provider value={contextValue}>{children}</CartContext.Provider>
  )
}
