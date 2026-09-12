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

function fakePrisma() {
  const record = { id: 'import-1', status: 'READY', summary: null, issues: null, truncated: false, totalRows: 1 };
  return {
    catalogImportRecord: {
      create: vi.fn(async ({ data }: { data: typeof record }) => ({ ...record, ...data })),
      findFirst: vi.fn(async ({ where }: { where: { id: string } }) => ({ ...record, id: where.id })),
      update: vi.fn(async () => record),
    },
    product: { findMany: vi.fn(async () => []) },
    productVariant: { findMany: vi.fn(async () => []) },
    attributeDefinition: { findMany: vi.fn(async () => []) },
    attributeOption: { findMany: vi.fn(async () => []) },
    brand: { findMany: vi.fn(async () => []) },
    category: { findMany: vi.fn(async () => []) },
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
});
