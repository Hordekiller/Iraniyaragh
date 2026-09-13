import ExcelJS from 'exceljs';
import { describe, expect, it, vi } from 'vitest';
import { CATALOG_SHEETS } from './catalog-import.parser';
import { CatalogImportService } from './catalog-import.service';

async function workbookBuffer() {
  const workbook = new ExcelJS.Workbook();
  const headers = [
    ['slug', 'name', 'description', 'brandSlug', 'categorySlug', 'status'],
    ['productSlug', 'sku', 'barcode', 'title', 'costPrice', 'salePrice', 'weightGrams', 'status'],
    ['code', 'name', 'description', 'status'],
    ['attributeCode', 'code', 'label', 'status'],
    ['sku', 'attributeCode', 'optionCode'],
  ];
  CATALOG_SHEETS.forEach((name, index) => workbook.addWorksheet(name).addRow(headers[index]));
  workbook.getWorksheet('Products')!.addRow(['shirt', 'Shirt', '', '', '', 'DRAFT']);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

async function invalidWorkbookBuffer() {
  const buffer = await workbookBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  workbook.getWorksheet('VariantAttributeValues')!.addRow(['missing-sku', 'color', 'red']);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

async function freshCatalogBuffer() {
  const workbook = new ExcelJS.Workbook();
  const headers = [
    ['slug', 'name', 'description', 'brandSlug', 'categorySlug', 'status'],
    ['productSlug', 'sku', 'barcode', 'title', 'costPrice', 'salePrice', 'weightGrams', 'status'],
    ['code', 'name', 'description', 'status'],
    ['attributeCode', 'code', 'label', 'status'],
    ['sku', 'attributeCode', 'optionCode'],
  ];
  CATALOG_SHEETS.forEach((name, index) => workbook.addWorksheet(name).addRow(headers[index]));
  workbook.getWorksheet('Products')!.addRow(['fresh-product', 'Fresh Product', '', '', '', 'DRAFT']);
  workbook.getWorksheet('Attributes')!.addRow(['color', 'Color', '', 'ACTIVE']);
  workbook.getWorksheet('AttributeOptions')!.addRow(['color', 'red', 'Red', 'ACTIVE']);
  workbook.getWorksheet('Variants')!.addRow(['fresh-product', 'FRESH-RED', '', '', '100000', '150000', '', 'ACTIVE']);
  workbook.getWorksheet('VariantAttributeValues')!.addRow(['FRESH-RED', 'color', 'red']);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

async function unknownBrandBuffer() {
  const buffer = await workbookBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  workbook.getWorksheet('Products')!.addRow(['brand-product', 'Brand Product', '', 'ghost-brand', '', 'DRAFT']);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

async function canonicalCollisionBuffer() {
  const buffer = await workbookBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  workbook.getWorksheet('Variants')!.addRow(['shirt', 'ABC-1', '', '', '100000', '150000', '', 'ACTIVE']);
  workbook.getWorksheet('Variants')!.addRow(['shirt', 'abc-1', '', '', '100000', '150000', '', 'ACTIVE']);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function fakePrisma() {
  const record = { id: 'import-1', status: 'READY', summary: null, issues: null, truncated: false, totalRows: 1 };
  const variant = { id: 'variant-1', costPrice: BigInt('100000'), salePrice: BigInt('150000') };
  return {
    catalogImportRecord: {
      create: vi.fn(async ({ data }: { data: typeof record }) => ({ ...record, ...data })),
      findFirst: vi.fn(async ({ where }: { where: { id: string } }) => ({ ...record, id: where.id })),
      update: vi.fn(async () => record),
    },
    product: { findMany: vi.fn(async () => []), upsert: vi.fn(async () => ({ id: 'product-1', slug: 'shirt' })) },
    productVariant: {
      findMany: vi.fn(async () => []),
      findUnique: vi.fn(async () => null),
      create: vi.fn(async () => variant),
      update: vi.fn(async () => variant),
    },
    attributeDefinition: { findMany: vi.fn(async () => []), upsert: vi.fn(async () => ({ id: 'attribute-1', code: 'color' })), findUnique: vi.fn(async () => null) },
    attributeOption: { findMany: vi.fn(async () => []), upsert: vi.fn(async () => ({ id: 'option-1', code: 'red' })) },
    brand: { findMany: vi.fn(async () => []), findUnique: vi.fn(async () => null) },
    category: { findMany: vi.fn(async () => []), findUnique: vi.fn(async () => null) },
    productAttributeConfiguration: { upsert: vi.fn(async () => ({ id: 'config-1' })) },
    productVariantAttributeValue: { deleteMany: vi.fn(async () => ({ count: 0 })), createMany: vi.fn(async () => ({ count: 1 })) },
    variantPriceRecord: { create: vi.fn(async () => ({ id: 'price-1' })) },
  };
}

describe('CatalogImportService', () => {
  it('persists only bounded report metadata on upload', async () => {
    const prisma = fakePrisma();
    const idempotency = { run: vi.fn(async ({ execute }: { execute: (tx: typeof prisma) => Promise<{ response: unknown }> }) => (await execute(prisma)).response as never) };
    const audit = { record: vi.fn() };
    const service = new CatalogImportService(prisma as never, audit as never, idempotency as never);

    const response = await service.upload('actor-1', 'upload-key', '1', await workbookBuffer());

    expect(response.data.report.importId).toMatch(/[a-z0-9-]+/u);
    expect(prisma.catalogImportRecord.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.not.objectContaining({ workbook: expect.anything(), buffer: expect.anything() }) }));
  });

  it('does not write catalog rows during dry-run', async () => {
    const prisma = fakePrisma();
    const idempotency = { run: vi.fn(async ({ execute }: { execute: (tx: typeof prisma) => Promise<{ response: unknown }> }) => (await execute(prisma)).response as never) };
    const service = new CatalogImportService(prisma as never, { record: vi.fn() } as never, idempotency as never);
    const upload = await service.upload('actor-1', 'upload-key', '1', await workbookBuffer());
    await service.dryRun('actor-1', upload.data.report.importId);

    expect(prisma.product.findMany).toHaveBeenCalled();
    expect(prisma.catalogImportRecord.update).toHaveBeenCalled();
    expect(prisma.product).not.toHaveProperty('create');
  });

  it('rejects invalid commits before opening catalog writes', async () => {
    const prisma = fakePrisma();
    const idempotency = { run: vi.fn(async ({ execute }: { execute: (tx: typeof prisma) => Promise<{ response: unknown }> }) => (await execute(prisma)).response as never) };
    const service = new CatalogImportService(prisma as never, { record: vi.fn() } as never, idempotency as never);
    const upload = await service.upload('actor-1', 'upload-key', '1', await invalidWorkbookBuffer());

    await expect(service.commit('actor-1', 'commit-key', upload.data.report.importId)).rejects.toMatchObject({ response: { code: 'IMPORT_VALIDATION' } });
    expect(prisma.product).not.toHaveProperty('create');
  });

  it('dry-runs a fresh single-file catalog with zero issues and commits successfully', async () => {
    const prisma = fakePrisma();
    const idempotency = { run: vi.fn(async ({ execute }: { execute: (tx: typeof prisma) => Promise<{ response: unknown }> }) => (await execute(prisma)).response as never) };
    const service = new CatalogImportService(prisma as never, { record: vi.fn() } as never, idempotency as never);
    const upload = await service.upload('actor-1', 'upload-key', '1', await freshCatalogBuffer());

    const dryRun = await service.dryRun('actor-1', upload.data.report.importId);

    expect(dryRun.data.report.status).toBe('READY');
    expect(dryRun.data.report.issues).toEqual([]);
    expect(dryRun.data.report.summary.products.create).toBe(1);
    expect(dryRun.data.report.summary.attributes.create).toBe(1);
    expect(dryRun.data.report.summary.options.create).toBe(1);
    expect(dryRun.data.report.summary.variants.create).toBe(1);

    await expect(service.commit('actor-1', 'commit-key', upload.data.report.importId)).resolves.toBeDefined();
    expect(prisma.productAttributeConfiguration.upsert).toHaveBeenCalled();
    expect(prisma.variantPriceRecord.create).toHaveBeenCalled();
  });

  it('surfaces unknown brand references in the dry-run report', async () => {
    const prisma = fakePrisma();
    const idempotency = { run: vi.fn(async ({ execute }: { execute: (tx: typeof prisma) => Promise<{ response: unknown }> }) => (await execute(prisma)).response as never) };
    const service = new CatalogImportService(prisma as never, { record: vi.fn() } as never, idempotency as never);
    const upload = await service.upload('actor-1', 'upload-key', '1', await unknownBrandBuffer());

    const dryRun = await service.dryRun('actor-1', upload.data.report.importId);

    expect(dryRun.data.report.status).toBe('FAILED');
    expect(dryRun.data.report.issues.some(issue => issue.code === 'IMPORT_VALIDATION' && issue.message.includes('unknown brand'))).toBe(true);
  });

  it('detects intra-workbook canonical SKU collisions', async () => {
    const prisma = fakePrisma();
    const idempotency = { run: vi.fn(async ({ execute }: { execute: (tx: typeof prisma) => Promise<{ response: unknown }> }) => (await execute(prisma)).response as never) };
    const service = new CatalogImportService(prisma as never, { record: vi.fn() } as never, idempotency as never);
    const upload = await service.upload('actor-1', 'upload-key', '1', await canonicalCollisionBuffer());

    const dryRun = await service.dryRun('actor-1', upload.data.report.importId);

    expect(dryRun.data.report.status).toBe('FAILED');
    expect(dryRun.data.report.issues.some(issue => issue.code === 'DUPLICATE_SKU')).toBe(true);
  });

  it('persists a FAILED status when the upload report has issues', async () => {
    const prisma = fakePrisma();
    const idempotency = { run: vi.fn(async ({ execute }: { execute: (tx: typeof prisma) => Promise<{ response: unknown }> }) => (await execute(prisma)).response as never) };
    const service = new CatalogImportService(prisma as never, { record: vi.fn() } as never, idempotency as never);

    const upload = await service.upload('actor-1', 'upload-key', '1', await invalidWorkbookBuffer());

    expect(upload.data.report.status).toBe('FAILED');
    expect(prisma.catalogImportRecord.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }));
  });
});
