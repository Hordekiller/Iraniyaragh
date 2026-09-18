'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AdminOrderMeta, AdminOrderQuery, AdminOrderSummary } from '@/lib/orders/orders-types';
import { ApiAbortError } from '@/lib/api/client';
import { ordersApi } from '@/lib/orders/orders-api';

export type AdminOrdersQuery = {
  page: number;
  perPage: number;
  search?: string;
  orderStatus?: AdminOrderQuery['orderStatus'];
  paymentStatus?: AdminOrderQuery['paymentStatus'];
  fulfillmentStatus?: AdminOrderQuery['fulfillmentStatus'];
  sortBy: 'createdAt' | 'updatedAt' | 'grandTotal';
  sortDir: 'asc' | 'desc';
};

export type AdminOrdersState = {
  items: AdminOrderSummary[];
  meta: AdminOrderMeta | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
};

const QUERY_KEYS: (keyof AdminOrdersQuery)[] = [
  'page',
  'perPage',
  'search',
  'orderStatus',
  'paymentStatus',
  'fulfillmentStatus',
  'sortBy',
  'sortDir',
];

function toPortQuery(query: AdminOrdersQuery): AdminOrderQuery {
  return {
    page: query.page,
    perPage: query.perPage,
    search: query.search || undefined,
    orderStatus: query.orderStatus,
    paymentStatus: query.paymentStatus,
    fulfillmentStatus: query.fulfillmentStatus,
    sortBy: query.sortBy,
    sortDir: query.sortDir,
  };
}

export function useOrders(query: AdminOrdersQuery, enabled = true): AdminOrdersState {
  const [items, setItems] = useState<AdminOrderSummary[]>([]);
  const [meta, setMeta] = useState<AdminOrderMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const key = QUERY_KEYS.map((k) => `${k}=${String(query[k] ?? '')}`).join('&');

  useEffect(() => {
    if (!enabled) {
      setItems([]);
      setMeta(null);
      setLoading(false);
      setError(null);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    ordersApi
      .listOrders(toPortQuery(query), controller.signal)
      .then((result) => {
        setItems(result.items);
        setMeta(result.meta);
      })
      .catch((err: unknown) => {
        if (err instanceof ApiAbortError) return;
        setError(err instanceof Error ? err.message : 'خطای غیرمنتظره در بارگیری سفارش‌ها.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [key, refreshKey, enabled]);

  const refresh = useCallback(() => setRefreshKey((current) => current + 1), []);

  return { items, meta, loading, error, refresh };
}
