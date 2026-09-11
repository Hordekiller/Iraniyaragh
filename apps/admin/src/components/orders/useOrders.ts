'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AdminOrderMeta, AdminOrderQuery, AdminOrderSummary } from '@/lib/orders/orders-types';
import { ordersApi } from '@/lib/orders/orders-fixture';

export type AdminOrdersQuery = {
  page: number;
  perPage: number;
  search?: string;
  orderStatus?: AdminOrderQuery['orderStatus'];
  paymentStatus?: AdminOrderQuery['paymentStatus'];
  fulfillmentStatus?: AdminOrderQuery['fulfillmentStatus'];
  sortBy: 'createdAt' | 'updatedAt' | 'totalRials';
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

export function useOrders(query: AdminOrdersQuery): AdminOrdersState {
  const [items, setItems] = useState<AdminOrderSummary[]>([]);
  const [meta, setMeta] = useState<AdminOrderMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const key = QUERY_KEYS.map((k) => `${k}=${String(query[k] ?? '')}`).join('&');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    ordersApi
      .listOrders(toPortQuery(query))
      .then((result) => {
        if (cancelled) return;
        setItems(result.items);
        setMeta(result.meta);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'خطای غیرمنتظره در بارگیری سفارش‌ها.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [key, refreshKey]);

  const refresh = useCallback(() => setRefreshKey((current) => current + 1), []);

  return { items, meta, loading, error, refresh };
}