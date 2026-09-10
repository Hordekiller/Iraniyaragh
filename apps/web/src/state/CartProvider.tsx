import { useMemo, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { CartController, LocalCartStorage } from '../services/cart/controller'
import type { CartStorage } from '../services/cart/controller'
import type { CartLine } from '../services/cart/types'
import { CartContext } from './cart-context'
import type { CartContextValue } from './cart-context'
import { useAuth } from './auth-context'

/**
 * React shell around the client-side `CartController`.
 *
 * The cart is in-memory and mirrored to `localStorage` (per the pre-backend
 * phase; see `services/cart/types.ts`). The controller is created once per
 * provider mount; the snapshot updates through `useSyncExternalStore`.
 */
export function CartProvider({
  children,
  storage,
}: {
  children: ReactNode
  storage?: CartStorage
}) {
  const { state: authState } = useAuth()
  const ownerKey = authState.principal?.userId ?? 'guest'
  const controller = useMemo(
    () => new CartController(storage ?? new LocalCartStorage(`iranyaragh.cart.v1.${ownerKey}`)),
    [ownerKey, storage],
  )

  const snapshots = useSyncExternalStore(
    controller.subscribe.bind(controller),
    () => controller.getState(),
    () => controller.getState(),
  )

  const value = useMemo<CartContextValue>(() => {
    const value: CartContextValue = {
      state: snapshots,
      controller,
      totals: controller.getTotals(),
      add: (line: CartLine) => controller.add(line),
      setQuantity: (productId: string, quantity: number) =>
        controller.setQuantity(productId, quantity),
      remove: (productId: string) => controller.remove(productId),
      clear: () => controller.clear(),
      isInCart: (productId: string) => controller.isInCart(productId),
      quantityOf: (productId: string) => controller.quantityOf(productId),
    }
    return value
  }, [snapshots, controller])

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}
