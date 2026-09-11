import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiAbortError } from '@/lib/api/client';
import { listProducts } from '@/lib/catalog/catalog-api';
import { useCatalogProducts, type CatalogProductsQuery } from '../useCatalogProducts';

vi.mock('@/lib/catalog/catalog-api', () => ({ listProducts: vi.fn() }));

const baseQuery: CatalogProductsQuery = {
  page: 1,
  perPage: 25,
  sortBy: 'createdAt',
  sortDir: 'desc',
};

const sampleMeta = { page: 1, perPage: 25, total: 1, pages: 1 };
const sampleItem = {
  id: 'p1',
  name: 'قفل',
  slug: 'lock',
  status: 'DRAFT' as const,
  brandId: null,
  categoryId: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const mockedList = vi.mocked(listProducts);

describe('useCatalogProducts', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('loads products and exposes items, meta and loading state', async () => {
    mockedList.mockResolvedValue({ items: [sampleItem], meta: sampleMeta });

    const { result } = renderHook(() => useCatalogProducts(baseQuery));

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.items).toEqual([sampleItem]);
    expect(result.current.meta).toEqual(sampleMeta);
    expect(result.current.error).toBeNull();
    expect(mockedList).toHaveBeenCalledTimes(1);
    expect(mockedList.mock.calls[0][0]).toEqual(baseQuery);
    expect(mockedList.mock.calls[0][1]).toBeInstanceOf(AbortSignal);
  });

  it('passes the category and status filters through to the API', async () => {
    mockedList.mockResolvedValue({ items: [], meta: { page: 1, perPage: 25, total: 0, pages: 0 } });
    const query = { ...baseQuery, status: 'PUBLISHED' as const, categoryId: 'c1' };

    renderHook(() => useCatalogProducts(query));

    await waitFor(() => expect(mockedList).toHaveBeenCalledTimes(1));
    expect(mockedList.mock.calls[0][0]).toMatchObject({ status: 'PUBLISHED', categoryId: 'c1' });
  });

  it('surfaces a fetch error', async () => {
    mockedList.mockRejectedValue(new Error('خطای سرور'));

    const { result } = renderHook(() => useCatalogProducts(baseQuery));

    await waitFor(() => expect(result.current.error).toBe('خطای سرور'));
    expect(result.current.items).toEqual([]);
  });

  it('ignores aborted requests but keeps prior data', async () => {
    mockedList.mockRejectedValue(new ApiAbortError());

    const { result } = renderHook(() => useCatalogProducts(baseQuery));

    await vi.waitFor(() => expect(mockedList).toHaveBeenCalledTimes(1));
    expect(result.current.error).toBeNull();
  });

  it('re-fetches when refresh() is called', async () => {
    mockedList.mockResolvedValue({ items: [], meta: { page: 1, perPage: 25, total: 0, pages: 0 } });

    const { result } = renderHook(() => useCatalogProducts(baseQuery));

    await waitFor(() => expect(mockedList).toHaveBeenCalledTimes(1));
    result.current.refresh();

    await waitFor(() => expect(mockedList).toHaveBeenCalledTimes(2));
  });
});