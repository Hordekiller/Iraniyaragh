'use client';

import { useCallback, useEffect, useState } from 'react';
import type { CatalogStatus, ProductListItem, ProductListMeta, ProductListQuery } from '@iranyaragh/contracts';
import { ApiAbortError } from '@/lib/api/client';
import { listProducts } from '@/lib/catalog/catalog-api';

export type CatalogProductsQuery = {
  page: number;
  perPage: number;
  search?: string;
  status?: CatalogStatus;
  brandId?: string;
  categoryId?: string;
  sortBy: 'name' | 'createdAt' | 'updatedAt';
  sortDir: 'asc' | 'desc';
};

export type CatalogProductsState = {
  items: ProductListItem[];
  meta: ProductListMeta | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
};

const QUERY_KEYS: (keyof CatalogProductsQuery)[] = [
  'page',
  'perPage',
  'search',
  'status',
  'brandId',
  'categoryId',
  'sortBy',
  'sortDir',
];

function toApiQuery(query: CatalogProductsQuery): ProductListQuery {
  return {
    page: query.page,
    perPage: query.perPage,
    search: query.search || undefined,
    status: query.status,
    brandId: query.brandId || undefined,
    categoryId: query.categoryId || undefined,
    sortBy: query.sortBy,
    sortDir: query.sortDir,
  };
}

export function useCatalogProducts(query: CatalogProductsQuery): CatalogProductsState {
  const [items, setItems] = useState<ProductListItem[]>([]);
  const [meta, setMeta] = useState<ProductListMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const key = QUERY_KEYS.map((k) => `${k}=${String(query[k] ?? '')}`).join('&');

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    listProducts(toApiQuery(query), controller.signal)
      .then((result) => {
        setItems(result.items);
        setMeta(result.meta);
      })
      .catch((err: unknown) => {
        if (err instanceof ApiAbortError) return;
        setError(err instanceof Error ? err.message : 'خطای غیرمنتظره در بارگیری کالاها.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [key, refreshKey]);

  const refresh = useCallback(() => setRefreshKey((current) => current + 1), []);

  return { items, meta, loading, error, refresh };
}