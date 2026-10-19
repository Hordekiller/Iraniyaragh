import { ProductStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import type { ParsedCatalogWorkbook } from './catalog-import.parser';
import { buildCatalogImportReport } from './catalog-import.report';

function workbook(overrides: Partial<ParsedCatalogWorkbook> = {}): ParsedCatalogWorkbook {
  return {
    products: [{ slug: 'hinge', name: 'Hinge', brandSlug: 'new-brand', categorySlug: 'new-category' }],
    variants: [{ productSlug: 'hinge', sku: 'SKU-1', costPrice: '100', salePrice: '200', status: 'ACTIVE' }],
    attributes: [{ code: 'finish', name: 'Finish', status: 'ACTIVE' }],
    options: [{ attributeCode: 'finish', code: 'chrome', label: 'Chrome', status: 'ACTIVE' }],
    values: [{ sku: 'SKU-1', attributeCode: 'finish', optionCode: 'chrome' }],
    totalRows: 4,
    ...overrides,
  };
}

function client(options: { products?: unknown[]; variants?: unknown[] } = {}) {
  return {
    product: { findMany: vi.fn(async () => options.products ?? []) },
    productVariant: { findMany: vi.fn(async () => options.variants ?? []) },
    attributeDefinition: { findMany: vi.fn(async () => [{ id: 'a-finish', code: 'finish', name: 'Finish', description: null, status: 'ACTIVE' }]) },
    attributeOption: { findMany: vi.fn(async () => [{ id: 'o-chrome', code: 'chrome', label: 'Chrome', status: 'ACTIVE', attribute: { code: 'finish' } }]) },
    brand: { findMany: vi.fn(async () => [{ slug: 'new-brand' }]) },
    category: { findMany: vi.fn(async () => [{ slug: 'new-category' }]) },
  };
}

describe('catalog import dry-run report', () => {
  it('reports changes to references, variant status, and attribute values', async () => {
    const db = client({
      products: [{ id: 'p1', slug: 'hinge', name: 'Hinge', description: null, status: ProductStatus.DRAFT, brandId: 'b-old', categoryId: 'c-old', brand: { slug: 'old-brand' }, category: { slug: 'old-category' } }],
      variants: [{ id: 'v1', sku: 'SKU-1', skuKey: 'SKU-1', productId: 'p1', barcode: null, title: null, costPrice: 100n, salePrice: 200n, weightGrams: null, status: 'INACTIVE', attributeValues: [{ attribute: { code: 'finish' }, option: { code: 'black' } }] }],
    });

    const report = await buildCatalogImportReport(db as never, 'import-1', workbook(), 'READY');

    expect(report.status).toBe('READY');
    expect(report.summary.products.update).toBe(1);
    expect(report.summary.variants.update).toBe(1);
  });

  it('reports duplicate barcodes within the workbook', async () => {
    const db = client();
    const data = workbook({
      products: [
        { slug: 'hinge', name: 'Hinge' },
        { slug: 'handle', name: 'Handle' },
      ],
      variants: [
        { productSlug: 'hinge', sku: 'SKU-1', barcode: '00123', costPrice: '100', salePrice: '200' },
        { productSlug: 'handle', sku: 'SKU-2', barcode: '00123', costPrice: '100', salePrice: '200' },
      ],
      attributes: [],
      options: [],
      values: [],
      totalRows: 4,
    });

    const report = await buildCatalogImportReport(db as never, 'import-2', data, 'READY');

    expect(report.status).toBe('FAILED');
    expect(report.issues.some(issue => issue.code === 'DUPLICATE_BARCODE')).toBe(true);
  });
});
