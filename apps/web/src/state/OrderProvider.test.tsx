import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AuthProvider } from '../state/AuthProvider'
import { AuthFixtureClient } from '../lib/auth/fixtures'
import { MemorySessionStore } from '../lib/auth/session-store'
import { OrderProvider } from '../state/OrderProvider'
import { useOrderApi } from '../state/order-context'
import type { OrderApi, StoreOrder } from '../services/cart/types'

const ORDER: StoreOrder = {
  id: 'IR-0001-1',
  createdAt: '2026-09-14T10:30:00.000Z',
  status: 'PENDING_PAYMENT',
  items: [],
  shippingRials: 0,
  subtotalRials: 0,
  totalRials: 0,
  shipping: {
    fullName: 'علی',
    mobile: '09120000000',
    province: 'تهران',
    city: 'تهران',
    postalCode: '1234567890',
    address: 'خیابان امام خمینی، پلاک ۴۲',
  },
}

function authShell(children: React.ReactNode) {
  return <AuthProvider api={new AuthFixtureClient({ store: new MemorySessionStore() })}>{children}</AuthProvider>
}

describe('OrderProvider', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('provides an injected api', async () => {
    const api: OrderApi = {
      createOrder: vi.fn(async () => ORDER),
      listOrders: vi.fn(async () => [ORDER]),
      getOrder: vi.fn(async () => ORDER),
      markPaid: vi.fn(async () => ORDER),
    }
    function Probe() {
      const orders = useOrderApi()
      return <span data-testid="orders-api">{orders === api ? 'yes' : 'no'}</span>
    }
    render(
      authShell(
        <OrderProvider api={api}>
          <Probe />
        </OrderProvider>,
      ),
    )
    expect(screen.getByTestId('orders-api')).toHaveTextContent('yes')
  })

  it('throws fail-closed when no api and the fixture flag is off', () => {
    expect(() =>
      render(
        authShell(
          <OrderProvider>
            <span>x</span>
          </OrderProvider>,
        ),
      ),
    ).toThrow('OrderProvider: the fixture order client is not enabled in this build.')
  })

  it('serves the fixture order client when VITE_FIXTURE_CATALOG=true', async () => {
    vi.resetModules()
    vi.stubEnv('VITE_FIXTURE_CATALOG', 'true')
    const freshOrder = await import('../state/OrderProvider')
    const freshOrderCtx = await import('../state/order-context')
    const freshAuth = await import('../state/AuthProvider')
    const freshAuthFix = await import('../lib/auth/fixtures')
    const freshStore = await import('../lib/auth/session-store')

    function Probe() {
      const orders = freshOrderCtx.useOrderApi()
      return <span data-testid="fixture-orders">{typeof orders.listOrders === 'function' ? 'ready' : 'no'}</span>
    }
    render(
      <freshAuth.AuthProvider api={new freshAuthFix.AuthFixtureClient({ store: new freshStore.MemorySessionStore() })}>
        <freshOrder.OrderProvider>
          <Probe />
        </freshOrder.OrderProvider>
      </freshAuth.AuthProvider>,
    )
    expect(screen.getByTestId('fixture-orders')).toHaveTextContent('ready')
  })
})