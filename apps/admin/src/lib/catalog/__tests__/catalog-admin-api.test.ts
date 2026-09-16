import { afterEach, describe, expect, it, vi } from 'vitest';
import { setAccessToken } from '@/lib/auth/token-store';
import {
  changeVariantStatus,
  commitCatalogImport,
  configureProductAttributes,
  createAttribute,
  createAttributeOption,
  generateVariants,
  getAttribute,
  getCatalogImport,
  getProduct,
  getVariantPriceHistory,
  listAttributes,
  previewVariantGeneration,
  runCatalogImportDryRun,
  updateAttribute,
  updateAttributeOption,
  updateVariant,
  updateVariantPrice,
  uploadCatalogImport,
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

describe('catalog admin api client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    setAccessToken(null);
  });

  function stubFetch(responseBody: unknown) {
    const fetchMock = vi.fn(async () => jsonResponse(responseBody));
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it('fetches a single admin product detail', async () => {
    setAccessToken('at-admin');
    const fetchMock = stubFetch({ data: { product: { id: 'p1' } } });

    await getProduct('p1');

    const [url, init] = callsOf(fetchMock)[0];
    expect(url).toBe(`${baseUrl}/catalog/admin/products/p1`);
    expect(init.method).toBe('GET');
    expect(init.headers).toEqual(expect.objectContaining({ Authorization: 'Bearer at-admin' }));
  });

  it('patches product attribute configurations with a stable version', async () => {
    setAccessToken('at-write');
    const fetchMock = stubFetch({ data: { product: { id: 'p1', version: 2 } } });

    await configureProductAttributes('p1', 1, [{ attributeCode: 'color', isVariantAxis: true }]);

    const [, init] = callsOf(fetchMock)[0];
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(String(init.body))).toEqual({
      expectedVersion: 1,
      configurations: [{ attributeCode: 'color', isVariantAxis: true }],
    });
  });

  it('lists attributes with the bearer token', async () => {
    setAccessToken('at-admin');
    const fetchMock = stubFetch({ data: { items: [] } });

    await listAttributes();

    const [url, init] = callsOf(fetchMock)[0];
    expect(url).toBe(`${baseUrl}/catalog/admin/attributes`);
    expect(init.headers).toEqual(expect.objectContaining({ Authorization: 'Bearer at-admin' }));
  });

  it('fetches a single attribute detail', async () => {
    setAccessToken('at-admin');
    const fetchMock = stubFetch({ data: { attribute: { id: 'a1' } } });

    await getAttribute('a1');

    const [url] = callsOf(fetchMock)[0];
    expect(url).toBe(`${baseUrl}/catalog/admin/attributes/a1`);
  });

  it('creates an attribute idempotently', async () => {
    setAccessToken('at-write');
    const fetchMock = stubFetch({ data: { attribute: { id: 'a1' } } });

    await createAttribute({ code: 'color', name: 'رنگ' }, 'attr-create-key');

    const [url, init] = callsOf(fetchMock)[0];
    expect(url).toBe(`${baseUrl}/catalog/admin/attributes`);
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual(expect.objectContaining({ 'Idempotency-Key': 'attr-create-key' }));
    expect(JSON.parse(String(init.body))).toEqual({ code: 'color', name: 'رنگ' });
  });

  it('updates an attribute with a version payload', async () => {
    const fetchMock = stubFetch({ data: { attribute: { id: 'a1' } } });

    await updateAttribute('a1', { name: 'رنگ جدید', expectedVersion: 2 });

    const [url, init] = callsOf(fetchMock)[0];
    expect(url).toBe(`${baseUrl}/catalog/admin/attributes/a1`);
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(String(init.body))).toEqual({ name: 'رنگ جدید', expectedVersion: 2 });
  });

  it('creates an attribute option under the attribute path idempotently', async () => {
    setAccessToken('at-write');
    const fetchMock = stubFetch({ data: { option: { id: 'o1' } } });

    await createAttributeOption('a1', { code: 'red', label: 'قرمز' }, 'option-key');

    const [url, init] = callsOf(fetchMock)[0];
    expect(url).toBe(`${baseUrl}/catalog/admin/attributes/a1/options`);
    expect(init.headers).toEqual(expect.objectContaining({ 'Idempotency-Key': 'option-key' }));
    expect(JSON.parse(String(init.body))).toEqual({ code: 'red', label: 'قرمز' });
  });

  it('updates an attribute option', async () => {
    const fetchMock = stubFetch({ data: { option: { id: 'o1' } } });

    await updateAttributeOption('a1', 'o1', { label: 'قرمز تیره', expectedVersion: 1 });

    const [url, init] = callsOf(fetchMock)[0];
    expect(url).toBe(`${baseUrl}/catalog/admin/attributes/a1/options/o1`);
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(String(init.body))).toEqual({ label: 'قرمز تیره', expectedVersion: 1 });
  });

  it('updates a variant with flat dimension fields', async () => {
    const fetchMock = stubFetch({ data: { variant: { id: 'v1' } } });

    await updateVariant('v1', { title: 'طلایی', weightGrams: 120, lengthCm: 10, expectedVersion: 3 });

    const [url, init] = callsOf(fetchMock)[0];
    expect(url).toBe(`${baseUrl}/catalog/admin/variants/v1`);
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(String(init.body))).toEqual({
      title: 'طلایی',
      weightGrams: 120,
      lengthCm: 10,
      expectedVersion: 3,
    });
  });

  it('changes a variant status idempotently', async () => {
    setAccessToken('at-write');
    const fetchMock = stubFetch({ data: { variant: { id: 'v1' } } });

    await changeVariantStatus('v1', { status: 'INACTIVE', expectedVersion: 3 }, 'variant-status-key');

    const [url, init] = callsOf(fetchMock)[0];
    expect(url).toBe(`${baseUrl}/catalog/admin/variants/v1/status`);
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual(expect.objectContaining({ 'Idempotency-Key': 'variant-status-key' }));
    expect(JSON.parse(String(init.body))).toEqual({ status: 'INACTIVE', expectedVersion: 3 });
  });

  it('updates a variant price and includes the reason', async () => {
    const fetchMock = stubFetch({ data: { variant: { id: 'v1' }, record: { id: 'r1' } } });

    await updateVariantPrice('v1', {
      costPrice: { amount: '110', currency: 'IRR' },
      salePrice: { amount: '220', currency: 'IRR' },
      reason: 'افزایش قیمت',
      expectedVersion: 3,
    });

    const [url, init] = callsOf(fetchMock)[0];
    expect(url).toBe(`${baseUrl}/catalog/admin/variants/v1/price`);
    expect(JSON.parse(String(init.body))).toEqual({
      costPrice: { amount: '110', currency: 'IRR' },
      salePrice: { amount: '220', currency: 'IRR' },
      reason: 'افزایش قیمت',
      expectedVersion: 3,
    });
  });

  it('fetches the variant price history', async () => {
    const fetchMock = stubFetch({ data: { items: [], meta: { page: 1, perPage: 100, total: 0, pages: 0 } } });

    await getVariantPriceHistory('v1');

    const [url] = callsOf(fetchMock)[0];
    expect(url).toBe(`${baseUrl}/catalog/admin/variants/v1/price-history`);
  });

  it('previews variant generation from a selection', async () => {
    const fetchMock = stubFetch({ data: { combinations: [], total: 0, limit: 2000 } });

    await previewVariantGeneration('p1', { optionSelection: { color: ['red'] } });

    const [url, init] = callsOf(fetchMock)[0];
    expect(url).toBe(`${baseUrl}/catalog/admin/products/p1/variants/preview`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ optionSelection: { color: ['red'] } });
  });

  it('generates variants idempotently with prices', async () => {
    setAccessToken('at-write');
    const fetchMock = stubFetch({ data: { variants: [] } });

    await generateVariants(
      'p1',
      {
        optionSelection: { color: ['red'] },
        costPrice: { amount: '50', currency: 'IRR' },
        salePrice: { amount: '80', currency: 'IRR' },
      },
      'generate-key',
    );

    const [url, init] = callsOf(fetchMock)[0];
    expect(url).toBe(`${baseUrl}/catalog/admin/products/p1/variants/generate`);
    expect(init.headers).toEqual(expect.objectContaining({ 'Idempotency-Key': 'generate-key' }));
    expect(JSON.parse(String(init.body))).toEqual({
      optionSelection: { color: ['red'] },
      costPrice: { amount: '50', currency: 'IRR' },
      salePrice: { amount: '80', currency: 'IRR' },
    });
  });

  it('uploads a catalog workbook as multipart with the version and key headers', async () => {
    setAccessToken('at-write');
    const fetchMock = stubFetch({ data: { report: { importId: 'imp-1', status: 'UPLOADED' } } });
    const file = new Blob([Buffer.from('workbook')], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

    await uploadCatalogImport(file, 'catalog.xlsx', 'upload-key');

    const [url, init] = callsOf(fetchMock)[0];
    expect(url).toBe(`${baseUrl}/catalog/admin/imports`);
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.headers as Record<string, string>)['Content-Type']).toBeUndefined();
    const form = init.body as FormData;
    expect(form.get('file')).toBeTruthy();
    expect((form.get('file') as File).name).toBe('catalog.xlsx');
  });

  it('uploads with the x-iranyaragh-catalog-version header', async () => {
    const fetchMock = stubFetch({ data: { report: { importId: 'imp-1' } } });
    await uploadCatalogImport(new Blob(), 'archive.xlsx', 'upload-key');

    const [, init] = callsOf(fetchMock)[0];
    expect(init.headers).toEqual(
      expect.objectContaining({ 'Idempotency-Key': 'upload-key', 'x-iranyaragh-catalog-version': '1' }),
    );
    expect((init.headers as Record<string, string>)['Content-Type']).toBeUndefined();
  });

  it('fetches an import report', async () => {
    const fetchMock = stubFetch({ data: { report: { importId: 'imp-1' } } });

    await getCatalogImport('imp-1');

    const [url] = callsOf(fetchMock)[0];
    expect(url).toBe(`${baseUrl}/catalog/admin/imports/imp-1`);
  });

  it('runs a dry-run against an upload without a body', async () => {
    const fetchMock = stubFetch({ data: { report: { importId: 'imp-1' } } });

    await runCatalogImportDryRun('imp-1');

    const [url, init] = callsOf(fetchMock)[0];
    expect(url).toBe(`${baseUrl}/catalog/admin/imports/imp-1/dry-run`);
    expect(init.method).toBe('POST');
    expect(init.body).toBeUndefined();
  });

  it('commits an import idempotently', async () => {
    setAccessToken('at-write');
    const fetchMock = stubFetch({ data: { result: { importId: 'imp-1', status: 'COMMITTED' } } });

    await commitCatalogImport('imp-1', 'commit-key');

    const [url, init] = callsOf(fetchMock)[0];
    expect(url).toBe(`${baseUrl}/catalog/admin/imports/imp-1/commit`);
    expect(init.headers).toEqual(expect.objectContaining({ 'Idempotency-Key': 'commit-key' }));
  });

  it('maps a failed import upload to ApiClientError', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(
        { code: 'IMPORT_VALIDATION', message: 'Workbook invalid.', requestId: 'req-1', statusCode: 422 },
        false,
        422,
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(uploadCatalogImport(new Blob(), 'bad.xlsx', 'key')).rejects.toMatchObject({
      name: 'ApiClientError',
      code: 'IMPORT_VALIDATION',
    });
  });
});