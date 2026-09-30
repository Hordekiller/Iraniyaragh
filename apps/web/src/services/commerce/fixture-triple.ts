import { fixtureAllProducts } from '../catalog/fixture-data'
import type { CommerceApi } from './context'
import { buildFixturePriceLookup, CartFixtureClient } from './cart'
import type { FixturePriceLookup } from './cart'
import { CheckoutFixtureClient } from './checkout'
import { LocalOrderStore } from './order-store'
import { OrdersFixtureClient } from './orders'

/**
 * Dev/e2e-only commerce triple (catalog + cart + checkout + orders) backed by
 * the hand-authored fixture catalog.
 *
 * This module statically imports `catalog/fixture-data`, so it MUST only ever be
 * reached through a dynamic `import()` from `CommerceProvider`. A static import
 * would pull the whole fixture catalog into the production entry chunk, which
 * the runtime-integrity policy (`scripts/check-bundle-fixtures.mjs`) rejects.
 */
export function buildFixtureCommerceApi(priceLookup?: FixturePriceLookup): CommerceApi {
  const resolvedLookup = priceLookup ?? buildFixturePriceLookup(fixtureAllProducts)
  const cart = new CartFixtureClient({ priceLookup: resolvedLookup })
  const orders = new LocalOrderStore()
  return {
    cart,
    checkout: new CheckoutFixtureClient({ cart, orders }),
    orders: new OrdersFixtureClient(orders),
  }
}
