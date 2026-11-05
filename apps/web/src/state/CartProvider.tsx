import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { CommerceCartController } from '../services/commerce/controller'
import { CommerceFixtureClient } from '../services/commerce/fixture'
import { CommerceHttpClient } from '../services/commerce/http'
import type { CommerceApi } from '../services/commerce/types'
import { CartContext } from './cart-context'
import { useAuth } from './auth-context'
import { commerceErrorMessage } from '../services/commerce/errors'

const PENDING_COUPON_KEY = 'iranyaragh.pendingCoupon'
const COUPON_PATTERN = /^[A-Za-z0-9\u06F0-\u06F9\u0660-\u0669 _-]{1,64}$/

function readPending(): string | null {
  try {
    const v = globalThis.localStorage?.getItem(PENDING_COUPON_KEY)
    return v && COUPON_PATTERN.test(v) ? v : null
  } catch {
    return null
  }
}
const pendingListeners = new Set<() => void>()
function subscribePending(listener: () => void): () => void {
  pendingListeners.add(listener)
  return () => pendingListeners.delete(listener)
}
function writePending(code: string | null): void {
  try {
    if (code) globalThis.localStorage?.setItem(PENDING_COUPON_KEY, code)
    else globalThis.localStorage?.removeItem(PENDING_COUPON_KEY)
  } catch {
    /* storage unavailable: the intent simply is not carried over */
  }
  for (const listener of pendingListeners) listener()
}


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
      (process.env.NEXT_PUBLIC_FIXTURE_CATALOG === 'true'
        ? new CommerceFixtureClient()
        : new CommerceHttpClient(
            auth.request,
            process.env.NEXT_PUBLIC_API_BASE_URL,
          ))
    return {
      api: commerceApi,
      controller: new CommerceCartController(commerceApi),
    }
    // api and auth.request are stable provider dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Server snapshot is null so hydration matches; the client reads storage.
  const pendingCoupon = useSyncExternalStore(subscribePending, readPending, () => null)
  const [couponNotice, setCouponNotice] = useState<string | null>(null)
  const applying = useRef(false)
  const setPendingCoupon = useCallback((code: string | null) => {
    const clean = code && COUPON_PATTERN.test(code.trim()) ? code.trim() : null
    writePending(clean)
  }, [])

  const snapshot = useSyncExternalStore(
    value.controller.subscribe,
    value.controller.getState,
    value.controller.getState,
  )

  useEffect(() => {
    value.controller.setAuthenticated(auth.state.phase === 'authenticated', auth.identityVersion)
  }, [auth.state.phase, auth.identityVersion, value.controller])

  // Carry a coupon typed as a guest into the signed-in cart once it is ready.
  useEffect(() => {
    if (!pendingCoupon || applying.current) return
    if (snapshot.owner !== 'customer' || snapshot.phase !== 'ready' || snapshot.cart.lines.length === 0) return
    applying.current = true
    value.controller
      .applyCoupon(pendingCoupon)
      .then(() => setCouponNotice('کد تخفیف شما پس از ورود اعمال شد.'))
      .catch((error) => setCouponNotice(`کد تخفیف اعمال نشد: ${commerceErrorMessage(error)}`))
      .finally(() => {
        writePending(null)
        applying.current = false
      })
  }, [pendingCoupon, snapshot.owner, snapshot.phase, snapshot.cart.lines.length, value.controller])

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
      applyCoupon: (code: string) => value.controller.applyCoupon(code),
      removeCoupon: () => value.controller.removeCoupon(),
      pendingCoupon,
      setPendingCoupon,
      couponNotice,
      dismissCouponNotice: () => setCouponNotice(null),
      isInCart: (variantId: string) =>
        snapshot.cart.lines.some((line) => line.variantId === variantId),
      quantityOf: (variantId: string) =>
        snapshot.cart.lines.find((line) => line.variantId === variantId)
          ?.quantity ?? 0,
    }),
    [snapshot, value, pendingCoupon, setPendingCoupon, couponNotice],
  )

  return (
    <CartContext.Provider value={contextValue}>{children}</CartContext.Provider>
  )
}
