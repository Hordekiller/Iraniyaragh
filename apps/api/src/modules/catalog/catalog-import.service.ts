import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma, ProductStatus } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import type { CatalogImportCommitResponse, CatalogImportDetailResponse, CatalogImportDryRunReport, CatalogImportDryRunResponse, CatalogImportIssue, CatalogImportSummary, CatalogImportUploadResponse } from '@iranyaragh/contracts';
import { getRequestId } from '../../common/request-context';
import { PrismaService } from '../../database/prisma.service';
import { AuditLogService } from '../audit/audit-log.service';
import { CatalogIdempotencyService } from './catalog-idempotency.service';
import { parseCatalogWorkbook, type ParsedCatalogWorkbook } from './catalog-import.parser';
import { canonicalizeSku, combinationSignature, EMPTY_AXIS_SIGNATURE } from './variant-identifiers';

const REPORT_LIMIT = 500;
const STORE_LIMIT = 32;
const TTL_MS = 24 * 60 * 60 * 1000;

type StoredImport = { workbook: ParsedCatalogWorkbook; expiresAt: number };
const emptyCounts = () => ({ create: 0, update: 0, unchanged: 0, error: 0 });
const emptySummary = (): CatalogImportSummary => ({ products: emptyCounts(), variants: emptyCounts(), attributes: emptyCounts(), options: emptyCounts() });

@Injectable()
export class CatalogImportService {
  private readonly parsed = new Map<string, StoredImport>();

  constructor(private readonly prisma: PrismaService, private readonly audit: AuditLogService, private readonly idempotency: CatalogIdempotencyService) {}

  async upload(actorId: string, key: string, workbookVersion: string, buffer: Buffer): Promise<CatalogImportUploadResponse> {
    if (workbookVersion !== '1') throw new UnprocessableEntityException({ code: 'IMPORT_VALIDATION', message: 'Unsupported catalog workbook version.' });
    const workbook = await parseCatalogWorkbook(buffer);
    const importId = randomUUID();
    this.remember(importId, workbook);
    const payload = { version: workbookVersion, digest: createHash('sha256').update(buffer).digest('hex'), totalRows: workbook.totalRows };
    return this.idempotency.run({
      actorId, scope: 'catalog.import.upload', key, payload,
      execute: async tx => {
        const report = await this.report(tx, importId, actorId, workbook, 'READY');
        await tx.catalogImportRecord.create({ data: { id: importId, actorId, version: workbookVersion, status: report.status, requestId: getRequestId(), totalRows: workbook.totalRows, summary: report.summary, issues: { issues: report.issues, items: report.items }, truncated: report.truncated, expiresAt: new Date(Date.now() + TTL_MS) } });
        await this.audit.record({ actorId, action: 'catalog.import.uploaded', entityType: 'CatalogImportRecord', entityId: importId, requestId: getRequestId(), after: { totalRows: workbook.totalRows, status: 'READY' } }, tx);
        return { response: { data: { report } }, resourceType: 'CatalogImportRecord', resourceId: importId };
      },
    });
  }

  async get(actorId: string, importId: string): Promise<CatalogImportDetailResponse> {
    const record = await this.prisma.catalogImportRecord.findFirst({ where: { id: importId, actorId } });
    if (!record) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Catalog import not found.' });
    return { data: { report: this.recordReport(record) } };
  }

  async dryRun(actorId: string, importId: string): Promise<CatalogImportDryRunResponse> {
    const record = await this.prisma.catalogImportRecord.findFirst({ where: { id: importId, actorId } });
    if (!record) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Catalog import not found.' });
    const workbook = this.getParsed(importId);
    const report = await this.report(this.prisma, importId, actorId, workbook, record.status);
    await this.prisma.catalogImportRecord.update({ where: { id: importId }, data: { summary: report.summary, issues: { issues: report.issues, items: report.items }, truncated: report.truncated, status: report.status, totalRows: report.totalRows } });
    return { data: { report } };
  }

  async commit(actorId: string, key: string, importId: string): Promise<CatalogImportCommitResponse> {
    return this.idempotency.run({
      actorId, scope: `catalog.import.commit:${importId}`, key, payload: { importId },
      execute: async tx => {
        const workbook = this.getParsed(importId);
        const record = await tx.catalogImportRecord.findFirst({ where: { id: importId, actorId } });
        if (!record) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Catalog import not found.' });
        if (record.status === 'COMMITTED') throw new ConflictException({ code: 'CONFLICT', message: 'Catalog import is already committed.' });
        const report = await this.report(tx, importId, actorId, workbook, record.status);
        if (report.issues.length > 0) {
          throw new UnprocessableEntityException({ code: 'IMPORT_VALIDATION', message: 'Catalog import contains validation errors.', details: { issues: report.issues } });
        }
        await this.apply(tx, actorId, workbook);
        const committedAt = new Date().toISOString();
        await tx.catalogImportRecord.update({ where: { id: importId }, data: { status: 'COMMITTED', summary: report.summary, issues: { issues: [], items: report.items }, truncated: false } });
        await this.audit.record({ actorId, action: 'catalog.import.committed', entityType: 'CatalogImportRecord', entityId: importId, requestId: getRequestId(), after: { status: 'COMMITTED', totalRows: workbook.totalRows } }, tx);
        return { response: { data: { result: { importId, status: 'COMMITTED', committedAt, summary: report.summary, errorCount: 0 } } }, resourceType: 'CatalogImportRecord', resourceId: importId };
      },
    });
  }

  private remember(id: string, workbook: ParsedCatalogWorkbook): void {
    this.prune();
    if (this.parsed.size >= STORE_LIMIT) {
      const oldest = this.parsed.keys().next().value;
      if (oldest) this.parsed.delete(oldest);
    }
    this.parsed.set(id, { workbook, expiresAt: Date.now() + TTL_MS });
  }

  private getParsed(id: string): ParsedCatalogWorkbook {
    this.prune();
    const stored = this.parsed.get(id);
    if (!stored) throw new ConflictException({ code: 'IMPORT_NOT_AVAILABLE', message: 'The parsed workbook is no longer available; upload it again.' });
    return stored.workbook;
  }

  private prune(): void {
    const now = Date.now();
    for (const [id, stored] of this.parsed) if (stored.expiresAt <= now) this.parsed.delete(id);
  }

  private async report(client: PrismaService | Prisma.TransactionClient, importId: string, _actorId: string, workbook: ParsedCatalogWorkbook, status: string): Promise<CatalogImportDryRunReport> {
    const summary = emptySummary();
    const issues: CatalogImportIssue[] = [];
    const items: CatalogImportDryRunReport['items'] = [];
    let issueCount = 0;
    let itemCount = 0;
    const issue = (sheet: string, rowNumber: number, key: string | null, code: CatalogImportIssue['code'], message: string) => { issueCount++; if (issues.length < REPORT_LIMIT) issues.push({ sheet, rowNumber, key, code, message }); };
    const addItem = (sheet: string, key: string, action: 'create' | 'update' | 'unchanged' | 'error') => { itemCount++; if (items.length < REPORT_LIMIT) items.push({ sheet, key, action, warnings: [] }); };
    const products = await client.product.findMany({ where: { slug: { in: workbook.products.map(row => row.slug) } }, select: { id: true, slug: true, name: true, description: true, status: true, brandId: true, categoryId: true } });
    const variants = await client.productVariant.findMany({ where: { skuKey: { in: workbook.variants.map(row => canonicalizeSku(row.sku)) } }, select: { id: true, sku: true, skuKey: true, productId: true, barcode: true, title: true, costPrice: true, salePrice: true, weightGrams: true, status: true } });
    const attributes = await client.attributeDefinition.findMany({ where: { code: { in: workbook.attributes.map(row => row.code) } }, select: { id: true, code: true, name: true, description: true, status: true } });
    const options = await client.attributeOption.findMany({ where: { code: { in: workbook.options.map(row => row.code) }, attribute: { code: { in: workbook.options.map(row => row.attributeCode) } } }, select: { id: true, code: true, label: true, status: true, attribute: { select: { code: true } } } });
    const productBySlug = new Map(products.map(row => [row.slug, row]));
    const variantBySku = new Map(variants.map(row => [row.sku, row]));
    const attributeByCode = new Map(attributes.map(row => [row.code, row]));
    const optionByKey = new Map(options.map(row => [`${row.attribute.code}:${row.code}`, row]));
    const duplicateKeys = (rows: Array<{ key: string; sheet: string; rowNumber: number }>) => { const seen = new Set<string>(); for (const row of rows) { if (seen.has(row.key)) issue(row.sheet, row.rowNumber, row.key, 'IMPORT_VALIDATION', 'The import contains a duplicate key.'); seen.add(row.key); } };
    duplicateKeys(workbook.products.map((row, index) => ({ key: row.slug, sheet: 'Products', rowNumber: index + 2 })));
    duplicateKeys(workbook.attributes.map((row, index) => ({ key: row.code, sheet: 'Attributes', rowNumber: index + 2 })));
    duplicateKeys(workbook.options.map((row, index) => ({ key: `${row.attributeCode}:${row.code}`, sheet: 'AttributeOptions', rowNumber: index + 2 })));
    duplicateKeys(workbook.values.map((row, index) => ({ key: `${row.sku}:${row.attributeCode}`, sheet: 'VariantAttributeValues', rowNumber: index + 2 })));
    for (const row of workbook.attributes) { const current = attributeByCode.get(row.code); const action = current ? (current.name === row.name && (current.description ?? '') === (row.description ?? '') && current.status === (row.status ?? 'ACTIVE') ? 'unchanged' : 'update') : 'create'; summary.attributes[action]++; addItem('Attributes', row.code, action); }
    for (const [index, row] of workbook.options.entries()) { const current = optionByKey.get(`${row.attributeCode}:${row.code}`); if (!attributeByCode.has(row.attributeCode)) issue('AttributeOptions', index + 2, row.code, 'ATTRIBUTE_OPTION_INVALID', 'Attribute does not exist in this import or catalog.'); const action = current ? (current.label === row.label && current.status === (row.status ?? 'ACTIVE') ? 'unchanged' : 'update') : 'create'; summary.options[action]++; addItem('AttributeOptions', `${row.attributeCode}:${row.code}`, current ? action : 'create'); }
    for (const row of workbook.products) { const current = productBySlug.get(row.slug); const action = current ? (current.name === row.name && (current.description ?? '') === (row.description ?? '') && current.status === (row.status === 'PUBLISHED' ? ProductStatus.ACTIVE : row.status ?? ProductStatus.DRAFT) ? 'unchanged' : 'update') : 'create'; summary.products[action]++; addItem('Products', row.slug, action); }
    for (const [index, row] of workbook.variants.entries()) { const product = productBySlug.get(row.productSlug); const current = variantBySku.get(row.sku); if (!product && !workbook.products.some(item => item.slug === row.productSlug)) issue('Variants', index + 2, row.sku, 'IMPORT_VALIDATION', 'Variant references an unknown product.'); if (current && product && current.productId !== product.id) issue('Variants', index + 2, row.sku, 'SKU_CHANGE_NOT_ALLOWED', 'An existing SKU cannot move to another product.'); const action = current ? (current.barcode === (row.barcode ?? null) && current.title === (row.title ?? null) && current.costPrice.toString() === row.costPrice && current.salePrice.toString() === row.salePrice && current.weightGrams?.toString() === (row.weightGrams ?? undefined) ? 'unchanged' : 'update') : 'create'; summary.variants[action]++; addItem('Variants', row.sku, action); }
    const seenSkus = new Set<string>();
    for (const [index, row] of workbook.variants.entries()) { if (seenSkus.has(row.sku)) issue('Variants', index + 2, row.sku, 'DUPLICATE_SKU', 'SKU appears more than once in the workbook.'); seenSkus.add(row.sku); if (variants.some(item => item.skuKey === canonicalizeSku(row.sku) && item.sku !== row.sku)) issue('Variants', index + 2, row.sku, 'DUPLICATE_SKU', 'SKU canonical key already exists.'); if (!/^\d{1,15}$/u.test(row.costPrice) || !/^\d{1,15}$/u.test(row.salePrice)) issue('Variants', index + 2, row.sku, 'IMPORT_VALIDATION', 'Prices must be integer IRR strings.'); }
    for (const [index, row] of workbook.values.entries()) { const variant = variantBySku.get(row.sku); const attribute = attributeByCode.get(row.attributeCode); const option = optionByKey.get(`${row.attributeCode}:${row.optionCode}`); if (!variant && !workbook.variants.some(item => item.sku === row.sku)) issue('VariantAttributeValues', index + 2, row.sku, 'ATTRIBUTE_OPTION_INVALID', 'Value references an unknown variant.'); if (!attribute || !option) issue('VariantAttributeValues', index + 2, row.sku, 'ATTRIBUTE_OPTION_INVALID', 'Attribute option is invalid.'); }
    const signatures = new Set<string>();
    for (const row of workbook.variants) { const values = workbook.values.filter(value => value.sku === row.sku).map(value => `${value.attributeCode}:${value.optionCode}`).sort(); const signature = `${row.productSlug}|${values.join('|')}`; if (signatures.has(signature)) issue('Variants', workbook.variants.indexOf(row) + 2, row.sku, 'DUPLICATE_VARIANT_COMBINATION', 'The product has a duplicate variant combination.'); signatures.add(signature); }
    return { importId, status: issueCount ? 'FAILED' : status === 'COMMITTED' ? 'COMMITTED' : 'READY', summary, issues, items, truncated: issueCount > REPORT_LIMIT || itemCount > REPORT_LIMIT, totalRows: workbook.totalRows };
  }

  private recordReport(record: { id: string; status: string; summary: unknown; issues: unknown; truncated: boolean; totalRows: number }): CatalogImportDryRunReport {
    const stored = record.issues && typeof record.issues === 'object' && !Array.isArray(record.issues) ? record.issues as { issues?: CatalogImportIssue[]; items?: CatalogImportDryRunReport['items'] } : { issues: record.issues as CatalogImportIssue[] };
    return { importId: record.id, status: record.status as CatalogImportDryRunReport['status'], summary: record.summary as CatalogImportSummary ?? emptySummary(), issues: stored.issues ?? [], items: stored.items ?? [], truncated: record.truncated, totalRows: record.totalRows };
  }

  private async apply(tx: Prisma.TransactionClient, actorId: string, workbook: ParsedCatalogWorkbook): Promise<void> {
    const attributes = new Map<string, { id: string }>();
    for (const row of workbook.attributes) { const current = await tx.attributeDefinition.upsert({ where: { code: row.code }, create: { code: row.code, name: row.name, description: row.description, status: (row.status ?? 'ACTIVE') as 'ACTIVE' | 'INACTIVE' }, update: { name: row.name, description: row.description, status: (row.status ?? 'ACTIVE') as 'ACTIVE' | 'INACTIVE', version: { increment: 1 } } }); attributes.set(row.code, current); }
    const options = new Map<string, { id: string }>();
    for (const row of workbook.options) { const attribute = attributes.get(row.attributeCode) ?? await tx.attributeDefinition.findUnique({ where: { code: row.attributeCode }, select: { id: true } }); if (!attribute) throw new UnprocessableEntityException({ code: 'ATTRIBUTE_OPTION_INVALID', message: 'Attribute option references an unknown attribute.' }); attributes.set(row.attributeCode, attribute); const option = await tx.attributeOption.upsert({ where: { attributeId_code: { attributeId: attribute.id, code: row.code } }, create: { attributeId: attribute.id, code: row.code, label: row.label, status: (row.status ?? 'ACTIVE') as 'ACTIVE' | 'INACTIVE' }, update: { label: row.label, status: (row.status ?? 'ACTIVE') as 'ACTIVE' | 'INACTIVE', version: { increment: 1 } } }); options.set(`${row.attributeCode}:${row.code}`, option); }
    const products = new Map<string, { id: string }>();
    for (const row of workbook.products) { const brand = row.brandSlug ? await tx.brand.findUnique({ where: { slug: row.brandSlug }, select: { id: true } }) : null; const category = row.categorySlug ? await tx.category.findUnique({ where: { slug: row.categorySlug }, select: { id: true } }) : null; if (row.brandSlug && !brand || row.categorySlug && !category) throw new UnprocessableEntityException({ code: 'IMPORT_VALIDATION', message: 'Product references an unknown brand or category.' }); const product = await tx.product.upsert({ where: { slug: row.slug }, create: { slug: row.slug, name: row.name, description: row.description, brandId: brand?.id, categoryId: category?.id, status: (row.status === 'PUBLISHED' ? 'ACTIVE' : row.status ?? 'DRAFT') as ProductStatus }, update: { name: row.name, description: row.description, brandId: brand?.id, categoryId: category?.id, status: (row.status === 'PUBLISHED' ? 'ACTIVE' : row.status ?? 'DRAFT') as ProductStatus, version: { increment: 1 } } }); products.set(row.slug, product); for (const attributeCode of new Set(workbook.values.filter(value => workbook.variants.some(variant => variant.productSlug === row.slug && variant.sku === value.sku)).map(value => value.attributeCode))) { const attribute = attributes.get(attributeCode) ?? await tx.attributeDefinition.findUnique({ where: { code: attributeCode }, select: { id: true } }); if (!attribute) throw new UnprocessableEntityException({ code: 'ATTRIBUTE_OPTION_INVALID', message: 'Variant value references an unknown attribute.' }); attributes.set(attributeCode, attribute); await tx.productAttributeConfiguration.upsert({ where: { productId_attributeId: { productId: product.id, attributeId: attribute.id } }, create: { productId: product.id, attributeId: attribute.id, isVariantAxis: true, isRequired: true }, update: { isVariantAxis: true, isRequired: true } }); } }
    const variants = new Map<string, { id: string }>();
    for (const row of workbook.variants) { const product = products.get(row.productSlug)!; const values = workbook.values.filter(value => value.sku === row.sku).map(value => ({ attributeId: attributes.get(value.attributeCode)!.id, optionId: options.get(`${value.attributeCode}:${value.optionCode}`)!.id })); const signature = values.length ? combinationSignature(values) : EMPTY_AXIS_SIGNATURE; const existing = await tx.productVariant.findUnique({ where: { sku: row.sku }, select: { id: true, productId: true } }); if (existing && existing.productId !== product.id) throw new ConflictException({ code: 'SKU_CHANGE_NOT_ALLOWED', message: 'An existing SKU cannot move to another product.' }); const variant = existing ? await tx.productVariant.update({ where: { id: existing.id }, data: { barcode: row.barcode ?? null, title: row.title ?? null, costPrice: BigInt(row.costPrice), salePrice: BigInt(row.salePrice), weightGrams: row.weightGrams ? Number(row.weightGrams) : null, status: (row.status ?? 'ACTIVE') as 'ACTIVE' | 'INACTIVE' | 'ARCHIVED', isActive: (row.status ?? 'ACTIVE') === 'ACTIVE', combinationSignature: signature, version: { increment: 1 } } }) : await tx.productVariant.create({ data: { productId: product.id, sku: row.sku, skuKey: canonicalizeSku(row.sku), barcode: row.barcode ?? null, title: row.title ?? null, costPrice: BigInt(row.costPrice), salePrice: BigInt(row.salePrice), weightGrams: row.weightGrams ? Number(row.weightGrams) : null, status: (row.status ?? 'ACTIVE') as 'ACTIVE' | 'INACTIVE' | 'ARCHIVED', isActive: (row.status ?? 'ACTIVE') === 'ACTIVE', combinationSignature: signature } }); variants.set(row.sku, variant); await tx.productVariantAttributeValue.deleteMany({ where: { variantId: variant.id } }); if (values.length) await tx.productVariantAttributeValue.createMany({ data: values.map(value => ({ variantId: variant.id, ...value })) }); await tx.variantPriceRecord.create({ data: { variantId: variant.id, costPrice: variant.costPrice, salePrice: variant.salePrice, source: 'IMPORT', actorUserId: actorId, requestId: getRequestId(), reason: 'Catalog import' } }); }
  }
}
