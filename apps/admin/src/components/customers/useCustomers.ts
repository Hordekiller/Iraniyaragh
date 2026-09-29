'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AdminCustomerSummary, OrderListMeta } from '@iranyaragh/contracts';
import { ApiAbortError } from '@/lib/api/client';
import { customersApi } from '@/lib/customers/customers-api';
import type { AdminCustomerQuery } from '@/lib/customers/customers-types';

export type AdminCustomersQuery = {
  page: number;
  perPage: number;
  search?: string;
  status?: 'ACTIVE' | 'INACTIVE';
  hasUserAccount?: boolean;
  sortBy: 'createdAt' | 'mobile' | 'lastName' | 'orderCount';
  sortDir: 'asc' | 'desc';
};

export type AdminCustomersState = {
  items: AdminCustomerSummary[];
  meta: OrderListMeta | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
};

const QUERY_KEYS: (keyof AdminCustomersQuery)[] = [
  'page',
  'perPage',
  'search',
  'status',
  'hasUserAccount',
  'sortBy',
  'sortDir',
];

export function toPortQuery(query: AdminCustomersQuery): AdminCustomerQuery {
  return {
    page: query.page,
    perPage: query.perPage,
    search: query.search || undefined,
    status: query.status,
    hasUserAccount: query.hasUserAccount,
    sortBy: query.sortBy,
    sortDir: query.sortDir,
  };
}

export function useCustomers(query: AdminCustomersQuery, enabled = true): AdminCustomersState {
  const [items, setItems] = useState<AdminCustomerSummary[]>([]);
  const [meta, setMeta] = useState<OrderListMeta | null>(null);
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

    customersApi
      .listCustomers(toPortQuery(query), controller.signal)
      .then((result) => {
        setItems(result.items);
        setMeta(result.meta);
      })
      .catch((failure: unknown) => {
        if (failure instanceof ApiAbortError) return;
        setError(
          failure instanceof Error ? failure.message : 'خطای غیرمنتظره در بارگذاری مشتریان.',
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [key, refreshKey, enabled]);

  const refresh = useCallback(() => setRefreshKey((current) => current + 1), []);

  return { items, meta, loading, error, refresh };
}
