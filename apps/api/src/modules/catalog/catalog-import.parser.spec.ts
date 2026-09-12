import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { CATALOG_SHEETS, exportCatalogWorkbook, parseCatalogWorkbook } from './catalog-import.parser';

async function workbookBuffer() {
  const workbook = new ExcelJS.Workbook();
  for (const name of CATALOG_SHEETS) {
    const sheet = workbook.addWorksheet(name);
    const headers = name === 'Products' ? ['slug', 'name', 'description', 'brandSlug', 'categorySlug', 'status'] : name === 'Variants' ? ['productSlug', 'sku', 'barcode', 'title', 'costPrice', 'salePrice', 'weightGrams', 'status'] : name === 'Attributes' ? ['code', 'name', 'description', 'status'] : name === 'AttributeOptions' ? ['attributeCode', 'code', 'label', 'status'] : ['sku', 'attributeCode', 'optionCode'];
    sheet.addRow(headers);
  }
  workbook.getWorksheet('Products')!.addRow(['shirt', 'Shirt', '', '', '', 'DRAFT']);
  workbook.getWorksheet('Variants')!.addRow(['shirt', 'SKU-1', '00123', 'Red', '100', '200', '', 'ACTIVE']);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

describe('catalog workbook parser', () => {
  it('parses fixed sheets and preserves text identifiers', async () => {
    const parsed = await parseCatalogWorkbook(await workbookBuffer());
    expect(parsed.products[0].slug).toBe('shirt');
    expect(parsed.variants[0].barcode).toBe('00123');
    expect(parsed.totalRows).toBe(2);
  });

  it('rejects formula cells and unknown sheet order', async () => {
    const buffer = await workbookBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    workbook.getWorksheet('Products')!.getCell('A2').value = { formula: '"shirt"', result: 'shirt' };
    await expect(parseCatalogWorkbook(Buffer.from(await workbook.xlsx.writeBuffer()))).rejects.toMatchObject({ response: { code: 'IMPORT_VALIDATION' } });
  });

  it('exports the same fixed sheet contract', async () => {
    const output = await exportCatalogWorkbook({ products: [], variants: [], attributes: [], options: [], values: [], totalRows: 0 });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(output);
    expect(workbook.worksheets.map(sheet => sheet.name)).toEqual([...CATALOG_SHEETS]);
  });
});
