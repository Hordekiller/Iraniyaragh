import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma, ProductStatus } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import type { CatalogImportCommitResponse, CatalogImportDetailResponse, CatalogImportDryRunResponse, CatalogImportUploadResponse } from '@iranyaragh/contracts';
import { getRequestId } from '../../common/request-context';
import { PrismaService } from '../../database/prisma.service';
import { AuditLogService } from '../audit/audit-log.service';
import { CatalogIdempotencyService } from './catalog-idempotency.service';
import { parseCatalogWorkbook, type ParsedCatalogWorkbook } from './catalog-import.parser';
import { buildCatalogImportReport, buildRecordReport } from './catalog-import.report';
import { canonicalizeSku, combinationSignature, EMPTY_AXIS_SIGNATURE } from './variant-identifiers';

const STORE_LIMIT = 32;
const TTL_MS = 24 * 60 * 60 * 1000;

type StoredImport = { workbook: ParsedCatalogWorkbook; expiresAt: number };

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
        const report = await buildCatalogImportReport(tx, importId, workbook, 'READY');
        await tx.catalogImportRecord.create({ data: { id: importId, actorId, version: workbookVersion, status: report.status, requestId: getRequestId(), totalRows: workbook.totalRows, summary: report.summary, issues: { issues: report.issues, items: report.items }, truncated: report.truncated, expiresAt: new Date(Date.now() + TTL_MS) } });
        await this.audit.record({ actorId, action: 'catalog.import.uploaded', entityType: 'CatalogImportRecord', entityId: importId, requestId: getRequestId(), after: { totalRows: workbook.totalRows, status: report.status } }, tx);
        return { response: { data: { report } }, resourceType: 'CatalogImportRecord', resourceId: importId };
      },
    });
  }

  async get(actorId: string, importId: string): Promise<CatalogImportDetailResponse> {
    const record = await this.prisma.catalogImportRecord.findFirst({ where: { id: importId, actorId } });
    if (!record) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Catalog import not found.' });
    return { data: { report: buildRecordReport(record) } };
  }

  async dryRun(actorId: string, importId: string): Promise<CatalogImportDryRunResponse> {
    const record = await this.prisma.catalogImportRecord.findFirst({ where: { id: importId, actorId } });
    if (!record) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Catalog import not found.' });
    const workbook = this.getParsed(importId);
    const report = await buildCatalogImportReport(this.prisma, importId, workbook, record.status);
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
        const report = await buildCatalogImportReport(tx, importId, workbook, record.status);
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
