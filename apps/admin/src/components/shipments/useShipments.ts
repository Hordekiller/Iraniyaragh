'use client';

import { useCallback, useEffect, useState } from 'react';
import type {
  AdminShipmentMeta,
  AdminShipmentQuery,
  AdminShipmentSummary,
  ShipmentStatus,
} from '@/lib/shipments/shipments-types';
import { ApiAbortError } from '@/lib/api/client';
import { shipmentsApi } from '@/lib/shipments/shipments-api';

export type AdminShipmentsQuery = {
  page: number;
  perPage: number;
  status?: ShipmentStatus;
  carrier?: string;
  trackingCode?: string;
  dispatchedFrom?: string;
  dispatchedTo?: string;
  sortBy: 'dispatchedAt' | 'orderNumber' | 'carrier';
  sortDir: 'asc' | 'desc';
};

export type AdminShipmentsState = {
  items: AdminShipmentSummary[];
  meta: AdminShipmentMeta | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
};

const QUERY_KEYS: (keyof AdminShipmentsQuery)[] = [
  'page',
  'perPage',
  'status',
  'carrier',
  'trackingCode',
  'dispatchedFrom',
  'dispatchedTo',
  'sortBy',
  'sortDir',
];

function toPortQuery(query: AdminShipmentsQuery): AdminShipmentQuery {
  return {
    page: query.page,
    perPage: query.perPage,
    status: query.status,
    carrier: query.carrier || undefined,
    trackingCode: query.trackingCode || undefined,
    dispatchedFrom: query.dispatchedFrom || undefined,
    dispatchedTo: query.dispatchedTo || undefined,
    sortBy: query.sortBy,
    sortDir: query.sortDir,
  };
}

export function useShipments(
  query: AdminShipmentsQuery,
  enabled = true,
): AdminShipmentsState {
  const [items, setItems] = useState<AdminShipmentSummary[]>([]);
  const [meta, setMeta] = useState<AdminShipmentMeta | null>(null);
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

    shipmentsApi
      .listShipments(toPortQuery(query), controller.signal)
      .then((result) => {
        setItems(result.items);
        setMeta(result.meta);
      })
      .catch((err: unknown) => {
        if (err instanceof ApiAbortError) return;
        setError(err instanceof Error ? err.message : 'خطای غیرمنتظره در بارگذاری ارسال‌ها.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [key, refreshKey, enabled]);

  const refresh = useCallback(() => setRefreshKey((current) => current + 1), []);

  return { items, meta, loading, error, refresh };
}
