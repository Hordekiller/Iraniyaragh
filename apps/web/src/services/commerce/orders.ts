import type {
  OrderDetail,
  OrderListMeta,
  OrderSummary,
} from '@iranyaragh/contracts'
import { AuthApiError } from '../../lib/auth/errors'
import { jsonRequest } from '../../lib/auth/request'
import type { MemorySessionStore } from '../../lib/auth/session-store'
import type { OrderStore } from './order-store'
import { orderSummaryFromDetail } from './types'

export interface OrdersApi {
  listOrders(): Promise<OrderSummary[]>
  getOrder(id: string): Promise<OrderDetail>
}

export type OrdersApiOptions = {
  store: MemorySessionStore
  fetch?: typeof fetch
  baseUrl?: string
}

function tokenFrom(store: MemorySessionStore): string {
  const token = store.getAccessToken()
  if (!token) {
    throw new AuthApiError({
      code: 'AUTH_REAUTHENTICATION_REQUIRED',
      message: 'برای مشاهده سفارشها ابتدا وارد شوید.',
      statusCode: 401,
    })
  }
  return token
}

/** Live customer orders client against `/api/v1/orders`. */
export class OrdersHttpClient implements OrdersApi {
  private readonly store: MemorySessionStore
  private readonly baseUrl: string
  private readonly fetcher?: typeof fetch

  constructor(options: OrdersApiOptions) {
    this.store = options.store
    this.baseUrl = options.baseUrl ?? ''
    this.fetcher = options.fetch
  }

  async listOrders(): Promise<OrderSummary[]> {
    const { data } = await jsonRequest<{ items: OrderSummary[]; meta: OrderListMeta }>('/api/v1/orders?page=1&perPage=50', {
      baseUrl: this.baseUrl,
      accessToken: tokenFrom(this.store),
      fetch: this.fetcher,
    })
    return data.items
  }

  async getOrder(id: string): Promise<OrderDetail> {
    const { data } = await jsonRequest<{ order: OrderDetail }>(
      `/api/v1/orders/${encodeURIComponent(id)}`,
      {
        baseUrl: this.baseUrl,
        accessToken: tokenFrom(this.store),
        fetch: this.fetcher,
      },
    )
    return data.order
  }
}

/** Dev/e2e orders mirror backed by the fixture `OrderStore`. */
export class OrdersFixtureClient implements OrdersApi {
  private readonly orders: OrderStore

  constructor(orders: OrderStore) {
    this.orders = orders
  }

  async listOrders(): Promise<OrderSummary[]> {
    return this.orders
      .readAll()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(orderSummaryFromDetail)
  }

  async getOrder(id: string): Promise<OrderDetail> {
    const order = this.orders.readAll().find(o => o.id === id)
    if (!order) {
      throw new AuthApiError({ code: 'NOT_FOUND', message: 'سفارش یافت نشد.', statusCode: 404 })
    }
    return order
  }
}