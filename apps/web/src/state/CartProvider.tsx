import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import type { CartView } from '@iranyaragh/contracts'
import { CartController, LocalCartStorage } from '../services/cart/controller'
import type { CartStorage } from '../services/cart/controller'
import type { CartLine } from '../services/cart/types'
import { computeCartTotals } from '../services/cart/types'
import type { CartTotals } from '../services/cart/types'
import { CartContext } from './cart-context'
import type { CartContextValue } from './cart-context'
import { useAuth } from './auth-context'
import { useOptionalCommerce } from '../services/commerce/context'
import type { StoreCartApi } from '../services/commerce/cart'
import { CartHttpClient } from '../services/commerce/cart'
import {
  cartQuoteToTotals,
  commerceErrorMessage,
  serverCartLineToView,
} from '../services/commerce/types'
import type { KnownLine } from '../services/commerce/types'

/**
 * Storefront cart state.
 *
 * Guests keep a lightweight client-side draft (in-memory + `localStorage`) so
 * browsing before sign-in does not lose selections; the draft is pushed into the
 * server cart the first time the user authenticates (merge semantics: the server
 * caps quantities/line count and returns a fresh `CartView`). Once signed in,
 * the server cart is the single authority: lines, prices and totals all come
 * from `/api/v1/cart`'s `CartQuote`, and our writes go through the ledger with
 * an `Idempotency-Key` on every mutation.
 *
 * Catalog metadata (image/slug/brand) is absent in server lines; it is attached
 * only for variants bought during this session (see `services/commerce/types`).
 *
 * A guest draft has no server quote, so it reports no shipping charge at all
 * rather than guessing a fee: `CartPage` labels the draft total as pre-quote and
 * the checkout quote becomes authoritative once the cart is submitted.
 */
function computeDraftTotals(lines: CartLine[]): CartTotals {
  return computeCartTotals(lines)
}

export function CartProvider({
  children,
  storage,
  cartApi,
}: {
  children: ReactNode
  storage?: CartStorage
  cartApi?: StoreCartApi
}) {
  const { state: authState, store } = useAuth()
  const commerce = useOptionalCommerce()
  const ownerKey = authState.principal?.userId ?? 'guest'
  // The local draft belongs to the device/browser, not to an account: it is the
  // guest cart that gets merged into the server cart on sign-in and is cleared
  // afterwards. Keeping one stable storage key is what makes that merge possible
  // (a per-user key would strand the guest draft on the old owner).
  const controller = useMemo(
    () => new CartController(storage ?? new LocalCartStorage('iranyaragh.cart.v1.guest')),
    [storage],
  )

  const draft = useSyncExternalStore(
    controller.subscribe.bind(controller),
    () => controller.getState(),
    () => controller.getState(),
  )

  const authenticated =
    authState.phase === 'authenticated' && Boolean(authState.principal)

  const resolvedClient = useMemo<StoreCartApi | null>(
    () => (cartApi ?? commerce?.cart) ?? new CartHttpClient({ store }),
    [cartApi, commerce?.cart, store],
  )

  const [serverCartState, setServerCartState] = useState<{ owner: string; cart: CartView } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [known, setKnown] = useState<Map<string, KnownLine>>(() => new Map())

  const serverCart = serverCartState?.owner === ownerKey ? serverCartState.cart : null
  const commitCart = useCallback(
    (cart: CartView) => setServerCartState({ owner: ownerKey, cart }),
    [ownerKey],
  )

  const remember = useCallback((line: CartLine) => {
    setKnown(prev => {
      const next = new Map(prev)
      next.set(line.variantId, {
        productId: line.productId ?? undefined,
        slug: line.slug ?? undefined,
        name: line.name,
        brand: line.brand ?? undefined,
        image: line.image ?? undefined,
        oldPrice: line.oldPrice ?? undefined,
      })
      return next
    })
  }, [])

  // Load the server cart on sign-in, merging any leftover guest draft.
  useEffect(() => {
    if (!authenticated) return undefined
    let cancelled = false
    const sync = async () => {
      setLoading(true)
      setError(null)
      try {
        let cart = await resolvedClient!.getCart()
        if (cancelled) return
        const draftLines = controller.getState().lines
        if (draftLines.length > 0) {
          for (const line of draftLines) {
            remember(line)
            cart = await resolvedClient!.addLine(line.variantId, line.quantity)
            if (cancelled) return
          }
          controller.clear()
        }
        commitCart(cart)
      } catch (cause) {
        if (!cancelled) setError(commerceErrorMessage(cause))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void sync()
    return () => {
      cancelled = true
    }
  }, [authenticated, resolvedClient, controller, remember, commitCart])

  const refresh = useCallback(async () => {
    if (!authenticated || !resolvedClient) return
    setLoading(true)
    setError(null)
    try {
      commitCart(await resolvedClient.getCart())
    } catch (cause) {
      setError(commerceErrorMessage(cause))
    } finally {
      setLoading(false)
    }
  }, [authenticated, resolvedClient, commitCart])

  const isServer = authenticated && serverCart !== null

  const lines: CartLine[] = useMemo(() => {
    if (!isServer) return draft.lines
    return serverCart.lines.map(line => serverCartLineToView(line, known.get(line.variantId)))
  }, [isServer, serverCart, draft.lines, known])

  const totals: CartTotals = useMemo(() => {
    if (!isServer || !serverCart) return computeDraftTotals(draft.lines)
    const quote = cartQuoteToTotals(serverCart.quote)
    return {
      ...quote,
      lineCount: lines.length,
      itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
    }
  }, [isServer, serverCart, lines, draft.lines])

  const mutate = useCallback(
    (operation: (client: StoreCartApi) => Promise<CartView>) => {
      if (!authenticated || !resolvedClient) return
      setError(null)
      void operation(resolvedClient)
        .then(commitCart)
        .catch(cause => setError(commerceErrorMessage(cause)))
    },
    [authenticated, resolvedClient, commitCart],
  )

  const add = useCallback(
    (line: CartLine) => {
      if (!authenticated) {
        controller.add(line)
        return
      }
      remember(line)
      mutate(client => client.addLine(line.variantId, line.quantity))
    },
    [authenticated, controller, mutate, remember],
  )

  const setQuantity = useCallback(
    (variantId: string, quantity: number) => {
      if (!authenticated) {
        controller.setQuantity(variantId, quantity)
        return
      }
      if (quantity <= 0) {
        mutate(client => client.removeLine(variantId))
        return
      }
      mutate(client => client.setQuantity(variantId, quantity))
    },
    [authenticated, controller, mutate],
  )

  const remove = useCallback(
    (variantId: string) => {
      if (!authenticated) {
        controller.remove(variantId)
        return
      }
      mutate(client => client.removeLine(variantId))
    },
    [authenticated, controller, mutate],
  )

  const clear = useCallback(() => {
    if (!authenticated) {
      controller.clear()
      return
    }
    setError(null)
    void (async () => {
      try {
        for (const line of serverCart?.lines ?? []) {
          await resolvedClient!.removeLine(line.variantId)
        }
        commitCart(await resolvedClient!.getCart())
      } catch (cause) {
        setError(commerceErrorMessage(cause))
      }
    })()
  }, [authenticated, controller, serverCart, resolvedClient, commitCart])

  const value = useMemo<CartContextValue>(
    () => ({
      state: { lines },
      controller,
      totals,
      add,
      setQuantity,
      remove,
      clear,
      isInCart: (variantId) => lines.some(line => line.variantId === variantId),
      quantityOf: (variantId) => lines.find(line => line.variantId === variantId)?.quantity ?? 0,
      source: isServer ? 'server' : 'draft',
      loading: authenticated ? loading : false,
      error,
      serverCart,
      refresh,
    }),
    [lines, controller, totals, add, setQuantity, remove, clear, isServer, loading, error, serverCart, refresh, authenticated],
  )

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}