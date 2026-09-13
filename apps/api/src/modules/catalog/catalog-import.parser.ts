import ExcelJS from 'exceljs';
import { UnprocessableEntityException, PayloadTooLargeException } from '@nestjs/common';

export const CATALOG_WORKBOOK_VERSION = '1';
export const CATALOG_IMPORT_MAX_BYTES = 10 * 1024 * 1024;
export const CATALOG_IMPORT_MAX_ROWS = 10_000;
export const CATALOG_SHEETS = ['Products', 'Variants', 'Attributes', 'AttributeOptions', 'VariantAttributeValues'] as const;

type ProductRow = { slug: string; name: string; description?: string; brandSlug?: string; categorySlug?: string; status?: string };
type VariantRow = { productSlug: string; sku: string; barcode?: string; title?: string; costPrice: string; salePrice: string; weightGrams?: string; status?: string };
type AttributeRow = { code: string; name: string; description?: string; status?: string };
type OptionRow = { attributeCode: string; code: string; label: string; status?: string };
type ValueRow = { sku: string; attributeCode: string; optionCode: string };

export type ParsedCatalogWorkbook = { products: ProductRow[]; variants: VariantRow[]; attributes: AttributeRow[]; options: OptionRow[]; values: ValueRow[]; totalRows: number };

const HEADERS: Record<(typeof CATALOG_SHEETS)[number], readonly string[]> = {
  Products: ['slug', 'name', 'description', 'brandSlug', 'categorySlug', 'status'],
  Variants: ['productSlug', 'sku', 'barcode', 'title', 'costPrice', 'salePrice', 'weightGrams', 'status'],
  Attributes: ['code', 'name', 'description', 'status'],
  AttributeOptions: ['attributeCode', 'code', 'label', 'status'],
  VariantAttributeValues: ['sku', 'attributeCode', 'optionCode'],
};

function invalid(message: string): never {
  throw new UnprocessableEntityException({ code: 'IMPORT_VALIDATION', message });
}

function text(value: unknown, required: boolean, field: string): string | undefined {
  if (value === null || value === undefined || value === '') {
    if (required) invalid(`${field} is required.`);
    return undefined;
  }
  if (typeof value === 'object') invalid(`${field} must be a value, not a formula.`);
  const result = String(value).trim();
  if (required && !result) invalid(`${field} is required.`);
  return result || undefined;
}

function rowValues(row: ExcelJS.Row, headers: readonly string[], strictIndexes = new Set<number>()): string[] {
  return headers.map((_, index) => {
    const value = row.getCell(index + 1).value;
    const blank = value === null || value === undefined || value === '';
    if (strictIndexes.has(index) && !blank && typeof value !== 'string') invalid(`${row.worksheet.name}!${row.number} identifier cells must be stored as text.`);
    return text(value, false, `${row.worksheet.name}!${row.number}`) ?? '';
  });
}

function parseSheet<T>(sheet: ExcelJS.Worksheet, headers: readonly string[], mapper: (values: string[]) => T, strictIndexes?: Set<number>): T[] {
  if (sheet.rowCount < 1) invalid(`${sheet.name} must contain a header row.`);
  const actual = rowValues(sheet.getRow(1), headers);
  if (actual.length !== headers.length || actual.some((header, index) => header !== headers[index])) invalid(`${sheet.name} has an invalid header row.`);
  const seen = new Set<string>();
  const rows: T[] = [];
  sheet.eachRow((row, number) => {
    if (number === 1 || headers.every((_, index) => {
      const value = row.getCell(index + 1).value;
      return value === null || value === undefined || value === '';
    })) return;
    const values = rowValues(row, headers, strictIndexes);
    const item = mapper(values);
    const key = JSON.stringify(item);
    if (seen.has(key)) invalid(`${sheet.name} contains a duplicate row at ${number}.`);
    seen.add(key);
    rows.push(item);
  });
  return rows;
}

export async function parseCatalogWorkbook(buffer: Buffer): Promise<ParsedCatalogWorkbook> {
  if (buffer.byteLength > CATALOG_IMPORT_MAX_BYTES) throw new PayloadTooLargeException({ code: 'IMPORT_TOO_LARGE', message: 'Workbook exceeds the 10 MB limit.' });
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as never);
  } catch {
    invalid('Workbook is not a valid .xlsx file.');
  }
  if (workbook.worksheets.length !== CATALOG_SHEETS.length || workbook.worksheets.some((sheet, index) => sheet.name !== CATALOG_SHEETS[index])) invalid('Workbook sheets must match the catalog v1 order exactly.');
  const products = parseSheet(workbook.getWorksheet('Products')!, HEADERS.Products, ([slug, name, description, brandSlug, categorySlug, status]) => ({ slug: text(slug, true, 'Products.slug')!, name: text(name, true, 'Products.name')!, description: text(description, false, 'Products.description'), brandSlug: text(brandSlug, false, 'Products.brandSlug'), categorySlug: text(categorySlug, false, 'Products.categorySlug'), status: text(status, false, 'Products.status') }), new Set([0]));
  const variants = parseSheet(workbook.getWorksheet('Variants')!, HEADERS.Variants, ([productSlug, sku, barcode, title, costPrice, salePrice, weightGrams, status]) => ({ productSlug: text(productSlug, true, 'Variants.productSlug')!, sku: text(sku, true, 'Variants.sku')!, barcode: text(barcode, false, 'Variants.barcode'), title: text(title, false, 'Variants.title'), costPrice: text(costPrice, true, 'Variants.costPrice')!, salePrice: text(salePrice, true, 'Variants.salePrice')!, weightGrams: text(weightGrams, false, 'Variants.weightGrams'), status: text(status, false, 'Variants.status') }), new Set([0, 1, 2]));
  const attributes = parseSheet(workbook.getWorksheet('Attributes')!, HEADERS.Attributes, ([code, name, description, status]) => ({ code: text(code, true, 'Attributes.code')!, name: text(name, true, 'Attributes.name')!, description: text(description, false, 'Attributes.description'), status: text(status, false, 'Attributes.status') }), new Set([0]));
  const options = parseSheet(workbook.getWorksheet('AttributeOptions')!, HEADERS.AttributeOptions, ([attributeCode, code, label, status]) => ({ attributeCode: text(attributeCode, true, 'AttributeOptions.attributeCode')!, code: text(code, true, 'AttributeOptions.code')!, label: text(label, true, 'AttributeOptions.label')!, status: text(status, false, 'AttributeOptions.status') }), new Set([0, 1]));
  const values = parseSheet(workbook.getWorksheet('VariantAttributeValues')!, HEADERS.VariantAttributeValues, ([sku, attributeCode, optionCode]) => ({ sku: text(sku, true, 'VariantAttributeValues.sku')!, attributeCode: text(attributeCode, true, 'VariantAttributeValues.attributeCode')!, optionCode: text(optionCode, true, 'VariantAttributeValues.optionCode')! }), new Set([0, 1, 2]));
  const totalRows = products.length + variants.length + attributes.length + options.length + values.length;
  if (totalRows > CATALOG_IMPORT_MAX_ROWS) throw new PayloadTooLargeException({ code: 'IMPORT_TOO_LARGE', message: 'Workbook exceeds the 10,000 row limit.' });
  return { products, variants, attributes, options, values, totalRows };
}

export async function exportCatalogWorkbook(data: ParsedCatalogWorkbook): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheets = [
    ['Products', HEADERS.Products, data.products], ['Variants', HEADERS.Variants, data.variants], ['Attributes', HEADERS.Attributes, data.attributes], ['AttributeOptions', HEADERS.AttributeOptions, data.options], ['VariantAttributeValues', HEADERS.VariantAttributeValues, data.values],
  ] as const;
  for (const [name, headers, rows] of sheets) {
    const sheet = workbook.addWorksheet(name);
    sheet.addRow(headers as string[]);
    for (const row of rows) sheet.addRow(Object.values(row));
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
