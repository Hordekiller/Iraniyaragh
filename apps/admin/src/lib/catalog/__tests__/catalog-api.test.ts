import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  BrandCreateRequest,
  BrandUpdateRequest,
  CategoryCreateRequest,
  CategoryUpdateRequest,
  ProductCreateRequest,
} from '@iranyaragh/contracts';
import { ApiClientError } from '@/lib/api/client';
import { getAccessToken, setAccessToken } from '@/lib/auth/token-store';
import {
  changeProductStatus,
  createBrand,
  createCategory,
  createProduct,
  listBrands,
  listCategories,
  listProducts,
  updateBrand,
  updateCategory,
} from '../catalog-api';

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    text: vi.fn(async () => JSON.stringify(body)),
  } as unknown as Response;
}

type FetchCall = [string, RequestInit];

function callsOf(fetchMock: ReturnType<typeof vi.fn>): FetchCall[] {
  return fetchMock.mock.calls as unknown as FetchCall[];
}

const baseUrl = ['http:', '', 'localhost:4000'].join('/') + '/api/v1';

describe('catalog-api', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    setAccessToken(null);
  });

  it('lists admin products with a serialized query and the bearer token', async () => {
    setAccessToken('at-catalog');
    const fetchMock = vi.fn(async () =>
      jsonResponse({ data: { items: [], meta: { page: 1, perPage: 25, total: 0, pages: 0 } } }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await listProducts({ page: 2, perPage: 10, search: 'قفل', status: 'PUBLISHED', sortBy: 'name', sortDir: 'asc' });

    expect(callsOf(fetchMock)[0][0]).toBe(
      `${baseUrl}/catalog/admin/products?page=2&perPage=10&search=${encodeURIComponent('قفل')}&status=PUBLISHED&sortBy=name&sortDir=asc`,
    );
    expect(callsOf(fetchMock)[0][1]).toEqual(
      expect.objectContaining({ method: 'GET', headers: expect.objectContaining({ Authorization: 'Bearer at-catalog' }) }),
    );
  });

  it('omits empty filters but keeps paging and sort from the products query', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ data: { items: [], meta: { page: 1, perPage: 25, total: 0, pages: 0 } } }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await listProducts({ page: 1, perPage: 25, sortBy: 'createdAt', sortDir: 'desc' });

    const url = callsOf(fetchMock)[0][0];
    expect(url).toBe(`${baseUrl}/catalog/admin/products?page=1&perPage=25&sortBy=createdAt&sortDir=desc`);
    expect(url).not.toMatch(/search=|status=|brandId=|categoryId=/);
  });

  it('creates a product with vendor auth and a JSON body', async () => {
    setAccessToken('at-write');
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        data: {
          product: {
            id: 'p1',
            name: 'قفل',
            slug: 'lock',
            status: 'DRAFT',
            brandId: null,
            categoryId: null,
            createdAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-01-01T00:00:00Z',
          },
        },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const payload: ProductCreateRequest = {
      name: 'قفل',
      slug: 'lock',
      status: 'DRAFT',
      variants: [
        {
          sku: 'SKU-1',
          costPrice: { amount: '1000', currency: 'IRR' },
          salePrice: { amount: '2000', currency: 'IRR' },
        },
      ],
    };
    await createProduct(payload, 'catalog-test-product');

    const [, init] = callsOf(fetchMock)[0];
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual(
      expect.objectContaining({ Authorization: 'Bearer at-write', 'Content-Type': 'application/json', 'Idempotency-Key': 'catalog-test-product' }),
    );
    expect(JSON.parse(String(init.body))).toEqual(payload);
  });

  it('posts a product status command to the status endpoint', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        data: {
          product: {
            id: 'p1',
            name: 'قفل',
            slug: 'lock',
            status: 'ARCHIVED',
            brandId: null,
            categoryId: null,
            createdAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-01-01T00:00:00Z',
          },
        },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await changeProductStatus('p1', 'archive', 'catalog-test-status');

    const [url, init] = callsOf(fetchMock)[0];
    expect(url).toBe(`${baseUrl}/catalog/admin/products/p1/status`);
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual(expect.objectContaining({ 'Idempotency-Key': 'catalog-test-status' }));
    expect(JSON.parse(String(init.body))).toEqual({ action: 'archive' });
  });

  it('reads brands and categories from the public endpoints', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ data: { items: [{ id: 'b1', name: 'ب', slug: 'b', productCount: 1 }] } }));
    vi.stubGlobal('fetch', fetchMock);

    const brands = await listBrands();
    expect(brands).toEqual([{ id: 'b1', name: 'ب', slug: 'b', productCount: 1 }]);
    expect(callsOf(fetchMock)[0][0]).toBe(`${baseUrl}/catalog/brands`);

    const categories = await listCategories();
    expect(categories).toEqual([{ id: 'b1', name: 'ب', slug: 'b', productCount: 1 }]);
    expect(callsOf(fetchMock)[1][0]).toBe(`${baseUrl}/catalog/categories`);
  });

  it('creates and updates a brand through the admin endpoints', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ data: { brand: { id: 'b1', name: 'x', slug: 'x', productCount: 0 } } }));
    vi.stubGlobal('fetch', fetchMock);
    setAccessToken('at');

    const createInput: BrandCreateRequest = { name: 'x', slug: 'x' };
    await createBrand(createInput, 'catalog-test-brand');
    const [, createInit] = callsOf(fetchMock)[0];
    expect(createInit.method).toBe('POST');
    expect(callsOf(fetchMock)[0][0]).toBe(`${baseUrl}/catalog/admin/brands`);

    const updateInput: BrandUpdateRequest = { name: 'y' };
    await updateBrand('b1', updateInput);
    const [, updateInit] = callsOf(fetchMock)[1];
    expect(updateInit.method).toBe('PATCH');
    expect(callsOf(fetchMock)[1][0]).toBe(`${baseUrl}/catalog/admin/brands/b1`);
    expect(JSON.parse(String(updateInit.body))).toEqual(updateInput);
  });

  it('creates and updates a category through the admin endpoints', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ data: { category: { id: 'c1', name: 'x', slug: 'x', parentId: null, children: [], createdAt: '', updatedAt: '' } } }));
    vi.stubGlobal('fetch', fetchMock);
    setAccessToken('at');

    await createCategory({ name: 'x', slug: 'x' } satisfies CategoryCreateRequest, 'catalog-test-category');
    expect(callsOf(fetchMock)[0][0]).toBe(`${baseUrl}/catalog/admin/categories`);

    await updateCategory('c1', { name: 'y', parentId: null } satisfies CategoryUpdateRequest);
    const [, updateInit] = callsOf(fetchMock)[1];
    expect(updateInit.method).toBe('PATCH');
    expect(JSON.parse(String(updateInit.body))).toEqual({ name: 'y', parentId: null });
  });

  it('propagates API failures as ApiClientError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          jsonResponse({ code: 'FORBIDDEN', message: 'no', requestId: 'r1', statusCode: 403 }, false, 403),
      ),
    );
    await expect(listProducts({ page: 1, perPage: 25, sortBy: 'createdAt', sortDir: 'desc' })).rejects.toBeInstanceOf(
      ApiClientError,
    );
  });

  it('does not leak the token through public brand/category reads', async () => {
    setAccessToken('at-secret');
    const fetchMock = vi.fn(async () => jsonResponse({ data: { items: [] } }));
    vi.stubGlobal('fetch', fetchMock);

    await listBrands();
    expect(callsOf(fetchMock)[0][1].headers).not.toHaveProperty('Authorization');
    expect(getAccessToken()).toBe('at-secret');
  });
});
