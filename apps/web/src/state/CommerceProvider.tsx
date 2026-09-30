import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useAuth } from './auth-context'
import { CommerceContext } from '../services/commerce/context'
import type { CommerceApi } from '../services/commerce/context'
import { CartHttpClient } from '../services/commerce/cart'
import type { FixturePriceLookup } from '../services/commerce/cart'
import { CheckoutHttpClient } from '../services/commerce/checkout'
import { OrdersHttpClient } from '../services/commerce/orders'

/**
 * Builds the default commerce API triple for the storefront.
 *
 * In a shipped build the real HTTP clients (`/api/v1/...`) are used and pages
 * fail closed with honest errors when the merchant API is unreachable. The
 * fixture triple is only substituted when an explicit `VITE_FIXTURE_CATALOG=true`
 * opt-in is baked into the build (dev/e2e only), mirroring the auth/catalog
 * fixture policy.
 */
function buildHttpCommerceApi(store: ReturnType<typeof useAuth>['store']): CommerceApi {
  return {
    cart: new CartHttpClient({ store }),
    checkout: new CheckoutHttpClient({ store }),
    orders: new OrdersHttpClient({ store }),
  }
}

export type CommerceProviderProps = {
  children: ReactNode
  /** Test/demo override: wins over the default triple. */
  api?: Partial<CommerceApi>
  /** Fixture-only price hook (dev/e2e builds). */
  priceLookup?: FixturePriceLookup
}

const fixtureCatalogEnabled = import.meta.env.VITE_FIXTURE_CATALOG === 'true'

type CommerceOverrides = {
  cart: CommerceApi['cart'] | null
  checkout: CommerceApi['checkout'] | null
  orders: CommerceApi['orders'] | null
}

function applyOverrides(base: CommerceApi, overrides: CommerceOverrides): CommerceApi {
  return {
    cart: overrides.cart ?? base.cart,
    checkout: overrides.checkout ?? base.checkout,
    orders: overrides.orders ?? base.orders,
  }
}

export function CommerceProvider({ children, api, priceLookup }: CommerceProviderProps) {
  const { store } = useAuth()
  // HTTP is the production default, so that triple is built during render; only
  // the lazy fixture import has to be resolved asynchronously.
  const [fixtureBase, setFixtureBase] = useState<CommerceApi | null>(null)

  const overrides = useMemo<CommerceOverrides>(
    () => ({ cart: api?.cart ?? null, checkout: api?.checkout ?? null, orders: api?.orders ?? null }),
    [api],
  )
  // A caller that supplies all three groups is already a complete triple.
  const complete = useMemo<CommerceApi | null>(
    () =>
      overrides.cart && overrides.checkout && overrides.orders
        ? { cart: overrides.cart, checkout: overrides.checkout, orders: overrides.orders }
        : null,
    [overrides],
  )
  const needsFixture = !complete && fixtureCatalogEnabled

  useEffect(() => {
    if (!needsFixture) return undefined
    // Dynamic import keeps the fixture catalog out of the production bundle;
    // see `CatalogProvider` and scripts/check-bundle-fixtures.mjs.
    let cancelled = false
    void import('../services/commerce/fixture-triple').then(({ buildFixtureCommerceApi }) => {
      if (!cancelled) setFixtureBase(buildFixtureCommerceApi(priceLookup))
    })
    return () => {
      cancelled = true
    }
  }, [needsFixture, priceLookup])

  const httpBase = useMemo(
    () => (!complete && !fixtureCatalogEnabled ? buildHttpCommerceApi(store) : null),
    [complete, store],
  )

  const value = useMemo(() => {
    if (complete) return complete
    const base = httpBase ?? fixtureBase
    return base ? applyOverrides(base, overrides) : null
  }, [complete, httpBase, fixtureBase, overrides])

  // Only reachable in fixture mode, before the lazy fixture triple resolves.
  if (!value) return null

  return <CommerceContext.Provider value={value}>{children}</CommerceContext.Provider>
}
