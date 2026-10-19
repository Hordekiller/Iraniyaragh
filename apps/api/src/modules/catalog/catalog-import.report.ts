import { Prisma, ProductStatus } from '@prisma/client';
import type {
  CatalogImportDryRunReport,
  CatalogImportIssue,
  CatalogImportSummary,
} from '@iranyaragh/contracts';
import type { PrismaService } from '../../database/prisma.service';
import type { ParsedCatalogWorkbook } from './catalog-import.parser';
import { canonicalizeSku } from './variant-identifiers';

const REPORT_LIMIT = 500;

type DbProduct = { id: string; slug: string; name: string; description: string | null; status: ProductStatus; brandId: string | null; categoryId: string | null; brand: { slug: string } | null; category: { slug: string } | null };
type DbAttribute = { id: string; code: string; name: string; description: string | null; status: 'ACTIVE' | 'INACTIVE' };
type DbOption = { id: string; code: string; label: string; status: 'ACTIVE' | 'INACTIVE'; attribute: { code: string } };
type DbVariant = { id: string; sku: string; skuKey: string; productId: string; barcode: string | null; title: string | null; costPrice: bigint | null; salePrice: bigint; weightGrams: number | null; status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED'; attributeValues: Array<{ attribute: { code: string }; option: { code: string } }> };

type Sink = {
  issue: (sheet: string, rowNumber: number, key: string | null, code: CatalogImportIssue['code'], message: string) => void;
  addItem: (sheet: string, key: string, action: 'create' | 'update' | 'unchanged' | 'error') => void;
};

type DbClient = PrismaService | Prisma.TransactionClient;

const emptyCounts = () => ({ create: 0, update: 0, unchanged: 0, error: 0 });

export const emptySummary = (): CatalogImportSummary => ({ products: emptyCounts(), variants: emptyCounts(), attributes: emptyCounts(), options: emptyCounts() });

function flagDuplicateKeys(sink: Sink, rows: Array<{ key: string; sheet: string; rowNumber: number }>): void {
  const seen = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.key)) sink.issue(row.sheet, row.rowNumber, row.key, 'IMPORT_VALIDATION', 'The import contains a duplicate key.');
    seen.add(row.key);
  }
}

function classifyAttributes(sk: Sink, summary: CatalogImportSummary, rows: ParsedCatalogWorkbook['attributes'], index: Map<string, DbAttribute>): void {
  for (const row of rows) {
    const current = index.get(row.code);
    const action: 'create' | 'update' | 'unchanged' = current ? (current.name === row.name && (current.description ?? '') === (row.description ?? '') && current.status === (row.status ?? 'ACTIVE') ? 'unchanged' : 'update') : 'create';
    summary.attributes[action]++;
    sk.addItem('Attributes', row.code, action);
  }
}

function classifyOptions(sk: Sink, summary: CatalogImportSummary, rows: ParsedCatalogWorkbook['options'], index: Map<string, DbOption>, attributeByCode: Map<string, DbAttribute>): void {
  for (const [rowNumber, row] of rows.entries()) {
    const current = index.get(`${row.attributeCode}:${row.code}`);
    if (!attributeByCode.has(row.attributeCode)) sk.issue('AttributeOptions', rowNumber + 2, row.code, 'ATTRIBUTE_OPTION_INVALID', 'Attribute does not exist in this import or catalog.');
    const action: 'create' | 'update' | 'unchanged' = current ? (current.label === row.label && current.status === (row.status ?? 'ACTIVE') ? 'unchanged' : 'update') : 'create';
    summary.options[action]++;
    sk.addItem('AttributeOptions', `${row.attributeCode}:${row.code}`, action);
  }
}

function classifyProducts(sk: Sink, summary: CatalogImportSummary, rows: ParsedCatalogWorkbook['products'], index: Map<string, DbProduct>, knownBrands: Set<string>, knownCategories: Set<string>): void {
  for (const [rowNumber, row] of rows.entries()) {
    if (row.brandSlug && !knownBrands.has(row.brandSlug)) sk.issue('Products', rowNumber + 2, row.slug, 'IMPORT_VALIDATION', 'Product references an unknown brand.');
    if (row.categorySlug && !knownCategories.has(row.categorySlug)) sk.issue('Products', rowNumber + 2, row.slug, 'IMPORT_VALIDATION', 'Product references an unknown category.');
    const current = index.get(row.slug);
    const action: 'create' | 'update' | 'unchanged' = current ? (
      current.name === row.name
      && (row.description === undefined || current.description === row.description)
      && (row.brandSlug === undefined || current.brand?.slug === row.brandSlug)
      && (row.categorySlug === undefined || current.category?.slug === row.categorySlug)
        ? 'unchanged' : 'update'
    ) : 'create';
    summary.products[action]++;
    sk.addItem('Products', row.slug, action);
  }
}

function classifyVariants(sk: Sink, summary: CatalogImportSummary, rows: ParsedCatalogWorkbook['variants'], productBySlug: Map<string, DbProduct>, variantBySku: Map<string, DbVariant>, dbVariants: DbVariant[], workbook: ParsedCatalogWorkbook): void {
  const seenSkus = new Map<string, string>();
  const seenBarcodes = new Map<string, string>();
  for (const [rowNumber, row] of rows.entries()) {
    const product = productBySlug.get(row.productSlug);
    const current = variantBySku.get(row.sku);
    if (!product && !workbook.products.some(item => item.slug === row.productSlug)) sk.issue('Variants', rowNumber + 2, row.sku, 'IMPORT_VALIDATION', 'Variant references an unknown product.');
    if (current && product && current.productId !== product.id) sk.issue('Variants', rowNumber + 2, row.sku, 'SKU_CHANGE_NOT_ALLOWED', 'An existing SKU cannot move to another product.');
    const key = canonicalizeSku(row.sku);
    const previous = seenSkus.get(key);
    if (previous) sk.issue('Variants', rowNumber + 2, row.sku, 'DUPLICATE_SKU', `SKU canonical key collides with ${previous}.`);
    seenSkus.set(key, row.sku);
    if (dbVariants.some(item => item.skuKey === key && item.sku !== row.sku)) sk.issue('Variants', rowNumber + 2, row.sku, 'DUPLICATE_SKU', 'SKU canonical key already exists.');
    if (row.barcode) {
      const previousBarcodeSku = seenBarcodes.get(row.barcode);
      if (previousBarcodeSku) sk.issue('Variants', rowNumber + 2, row.sku, 'DUPLICATE_BARCODE', `Barcode collides with ${previousBarcodeSku}.`);
      seenBarcodes.set(row.barcode, row.sku);
      if (dbVariants.some(item => item.barcode === row.barcode && item.sku !== row.sku)) sk.issue('Variants', rowNumber + 2, row.sku, 'DUPLICATE_BARCODE', 'Barcode already belongs to another SKU.');
    }
    const expectedValues = workbook.values.filter(value => value.sku === row.sku).map(value => `${value.attributeCode}:${value.optionCode}`).sort((left, right) => left.localeCompare(right));
    const currentValues = current?.attributeValues.map(value => `${value.attribute.code}:${value.option.code}`).sort((left, right) => left.localeCompare(right)) ?? [];
    const requestedStatus = row.status as DbVariant['status'] | undefined;
    const attributesMatch = expectedValues.length === 0 || JSON.stringify(expectedValues) === JSON.stringify(currentValues);
    const action: 'create' | 'update' | 'unchanged' = current ? (
      (row.barcode === undefined || current.barcode === row.barcode)
      && (row.title === undefined || current.title === row.title)
      && (row.costPrice === undefined || (current.costPrice?.toString() ?? null) === row.costPrice)
      && current.salePrice.toString() === row.salePrice
      && (row.weightGrams === undefined || current.weightGrams?.toString() === row.weightGrams)
      && (requestedStatus === undefined || current.status === requestedStatus)
      && attributesMatch
        ? 'unchanged' : 'update'
    ) : 'create';
    summary.variants[action]++;
    sk.addItem('Variants', row.sku, action);
    if ((row.costPrice !== undefined && !/^\d{1,15}$/u.test(row.costPrice)) || !/^\d{1,15}$/u.test(row.salePrice)) sk.issue('Variants', rowNumber + 2, row.sku, 'IMPORT_VALIDATION', 'A supplied price must be an integer IRR string; sale price is required.');
  }
}

function classifyValues(sk: Sink, rows: ParsedCatalogWorkbook['values'], variantBySku: Map<string, DbVariant>, attributeByCode: Map<string, DbAttribute>, optionByKey: Map<string, DbOption>, workbook: ParsedCatalogWorkbook): void {
  for (const [rowNumber, row] of rows.entries()) {
    const variant = variantBySku.get(row.sku);
    const attribute = attributeByCode.get(row.attributeCode);
    const option = optionByKey.get(`${row.attributeCode}:${row.optionCode}`);
    if (!variant && !workbook.variants.some(item => item.sku === row.sku)) sk.issue('VariantAttributeValues', rowNumber + 2, row.sku, 'ATTRIBUTE_OPTION_INVALID', 'Value references an unknown variant.');
    if (!attribute || !option) sk.issue('VariantAttributeValues', rowNumber + 2, row.sku, 'ATTRIBUTE_OPTION_INVALID', 'Attribute option is invalid.');
  }
}

function detectDuplicateCombinations(sk: Sink, workbook: ParsedCatalogWorkbook): void {
  const signatures = new Set<string>();
  for (const row of workbook.variants) {
    const values = workbook.values.filter(value => value.sku === row.sku).map(value => `${value.attributeCode}:${value.optionCode}`).sort((a, b) => a.localeCompare(b));
    const signature = `${row.productSlug}|${values.join('|')}`;
    if (signatures.has(signature)) sk.issue('Variants', workbook.variants.indexOf(row) + 2, row.sku, 'DUPLICATE_VARIANT_COMBINATION', 'The product has a duplicate variant combination.');
    signatures.add(signature);
  }
}

export async function buildCatalogImportReport(client: DbClient, importId: string, workbook: ParsedCatalogWorkbook, status: string): Promise<CatalogImportDryRunReport> {
  const summary = emptySummary();
  const issues: CatalogImportIssue[] = [];
  const items: CatalogImportDryRunReport['items'] = [];
  let issueCount = 0;
  let itemCount = 0;
  const sk: Sink = {
    issue: (sheet, rowNumber, key, code, message) => {
      issueCount++;
      if (issues.length < REPORT_LIMIT) issues.push({ sheet, rowNumber, key, code, message });
    },
    addItem: (sheet, key, action) => {
      itemCount++;
      if (items.length < REPORT_LIMIT) items.push({ sheet, key, action, warnings: [] });
    },
  };

  const products = await client.product.findMany({ where: { slug: { in: workbook.products.map(row => row.slug) } }, select: { id: true, slug: true, name: true, description: true, status: true, brandId: true, categoryId: true, brand: { select: { slug: true } }, category: { select: { slug: true } } } });
  const requestedBarcodes = workbook.variants.flatMap(row => row.barcode ? [row.barcode] : []);
  const variants = await client.productVariant.findMany({ where: { OR: [{ skuKey: { in: workbook.variants.map(row => canonicalizeSku(row.sku)) } }, { barcode: { in: requestedBarcodes } }] }, select: { id: true, sku: true, skuKey: true, productId: true, barcode: true, title: true, costPrice: true, salePrice: true, weightGrams: true, status: true, attributeValues: { select: { attribute: { select: { code: true } }, option: { select: { code: true } } } } } });
  const attributes = await client.attributeDefinition.findMany({ where: { code: { in: workbook.attributes.map(row => row.code) } }, select: { id: true, code: true, name: true, description: true, status: true } });
  const options = await client.attributeOption.findMany({ where: { code: { in: workbook.options.map(row => row.code) }, attribute: { code: { in: workbook.options.map(row => row.attributeCode) } } }, select: { id: true, code: true, label: true, status: true, attribute: { select: { code: true } } } });

  const productBySlug = new Map(products.map(row => [row.slug, row]));
  const variantBySku = new Map(variants.filter(row => workbook.variants.some(item => canonicalizeSku(item.sku) === row.skuKey)).map(row => [row.sku, row]));
  const attributeByCode = new Map(attributes.map(row => [row.code, row]));
  const attributeDbIndex = new Map(attributes.map(row => [row.code, row]));
  for (const row of workbook.attributes) if (!attributeByCode.has(row.code)) attributeByCode.set(row.code, { id: `workbook:${row.code}`, code: row.code, name: row.name, description: row.description ?? null, status: (row.status ?? 'ACTIVE') as 'ACTIVE' | 'INACTIVE' });
  const optionByKey = new Map(options.map(row => [`${row.attribute.code}:${row.code}`, row]));
  const optionDbIndex = new Map(options.map(row => [`${row.attribute.code}:${row.code}`, row]));
  for (const row of workbook.options) if (!optionByKey.has(`${row.attributeCode}:${row.code}`)) optionByKey.set(`${row.attributeCode}:${row.code}`, { id: `workbook:${row.attributeCode}:${row.code}`, code: row.code, label: row.label, status: (row.status ?? 'ACTIVE') as 'ACTIVE' | 'INACTIVE', attribute: { code: row.attributeCode } });

  flagDuplicateKeys(sk, workbook.products.map((row, index) => ({ key: row.slug, sheet: 'Products', rowNumber: index + 2 })));
  flagDuplicateKeys(sk, workbook.attributes.map((row, index) => ({ key: row.code, sheet: 'Attributes', rowNumber: index + 2 })));
  flagDuplicateKeys(sk, workbook.options.map((row, index) => ({ key: `${row.attributeCode}:${row.code}`, sheet: 'AttributeOptions', rowNumber: index + 2 })));
  flagDuplicateKeys(sk, workbook.values.map((row, index) => ({ key: `${row.sku}:${row.attributeCode}`, sheet: 'VariantAttributeValues', rowNumber: index + 2 })));

  classifyAttributes(sk, summary, workbook.attributes, attributeDbIndex);
  classifyOptions(sk, summary, workbook.options, optionDbIndex, attributeByCode);

  const brandSlugs = workbook.products.flatMap(row => row.brandSlug ? [row.brandSlug] : []);
  const categorySlugs = workbook.products.flatMap(row => row.categorySlug ? [row.categorySlug] : []);
  const [brands, categories] = await Promise.all([client.brand.findMany({ where: { slug: { in: brandSlugs } }, select: { slug: true } }), client.category.findMany({ where: { slug: { in: categorySlugs } }, select: { slug: true } })]);
  const knownBrands = new Set(brands.map(row => row.slug));
  const knownCategories = new Set(categories.map(row => row.slug));

  classifyProducts(sk, summary, workbook.products, productBySlug, knownBrands, knownCategories);
  classifyVariants(sk, summary, workbook.variants, productBySlug, variantBySku, variants, workbook);
  classifyValues(sk, workbook.values, variantBySku, attributeByCode, optionByKey, workbook);
  detectDuplicateCombinations(sk, workbook);

  return { importId, status: issueCount ? 'FAILED' : status === 'COMMITTED' ? 'COMMITTED' : 'READY', summary, issues, items, truncated: issueCount > REPORT_LIMIT || itemCount > REPORT_LIMIT, totalRows: workbook.totalRows };
}

export function buildRecordReport(record: { id: string; status: string; summary: unknown; issues: unknown; truncated: boolean; totalRows: number }): CatalogImportDryRunReport {
  const stored = record.issues && typeof record.issues === 'object' && !Array.isArray(record.issues) ? record.issues as { issues?: CatalogImportIssue[]; items?: CatalogImportDryRunReport['items'] } : { issues: record.issues as CatalogImportIssue[] };
  return { importId: record.id, status: record.status as CatalogImportDryRunReport['status'], summary: record.summary as CatalogImportSummary ?? emptySummary(), issues: stored.issues ?? [], items: stored.items ?? [], truncated: record.truncated, totalRows: record.totalRows };
}
