import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma, ProductStatus } from '@prisma/client';
import type {
  AttributeDefinitionResponse, AttributeListResponse, AttributeOptionResponse, BrandListResponse, BrandResponse, CategoryListResponse, CategoryResponse, CategoryTreeResponse,
  ProductDetailPublicResponse, ProductDetailResponse, ProductListResponse, ProductStatusResponse, ProductVariantResponse, VariantGeneratePreviewResponse, VariantGenerateResponse, VariantPriceHistoryResponse, VariantPriceResponse,
} from '@iranyaragh/contracts';
import { getRequestId } from '../../common/request-context';
import { PrismaService } from '../../database/prisma.service';
import { AuditLogService } from '../audit/audit-log.service';
import type { AttributeDefinitionCreateDto, AttributeDefinitionUpdateDto, AttributeOptionCreateDto, AttributeOptionUpdateDto, BrandCreateDto, BrandUpdateDto, CategoryCreateDto, CategoryUpdateDto, ProductAttributeConfigurationUpdateDto, ProductCreateDto, ProductListQueryDto, ProductStatusDto, ProductVariantStatusDto, ProductVariantUpdateDto, VariantGenerateDto, VariantGeneratePreviewDto, VariantPriceUpdateDto } from './catalog.dto';
import { CatalogIdempotencyService } from './catalog-idempotency.service';
import { EMPTY_AXIS_SIGNATURE, canonicalizeSku, combinationSignature, legacyCombinationSignature, pendingCombinationSignature } from './variant-identifiers';

const VARIANT_COMBINATION_LIMIT = 2_000;

const statusToDb = (status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED' | undefined): ProductStatus | undefined =>
  status === 'PUBLISHED' ? ProductStatus.ACTIVE : status;
const statusesToDb = (status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED' | undefined): ProductStatus[] =>
  status === 'DRAFT' ? [ProductStatus.DRAFT, ProductStatus.INACTIVE] : status === 'PUBLISHED' ? [ProductStatus.ACTIVE] : status === 'ARCHIVED' ? [ProductStatus.ARCHIVED] : [];
const statusToApi = (status: ProductStatus): 'DRAFT' | 'PUBLISHED' | 'ARCHIVED' =>
  status === ProductStatus.ACTIVE ? 'PUBLISHED' : status === ProductStatus.ARCHIVED ? 'ARCHIVED' : 'DRAFT';
const PRODUCT_SORT_FIELDS = new Set(['name', 'createdAt', 'updatedAt'] as const);
const ORDER_DIRECTIONS = new Set(['asc', 'desc'] as const);

type CategoryTreeNode = { id: string; name: string; slug: string; parentId: string | null; children: CategoryTreeNode[]; createdAt: string; updatedAt: string };
type CategoryInput = { id: string; name: string; slug: string; parentId: string | null; createdAt: Date | string; updatedAt: Date | string; children?: CategoryInput[] };
type BrandRow = { id: string; name: string; slug: string; _count: { products: number } };
type CategoryRow = { id: string; name: string; slug: string; parentId: string | null; _count: { products: number } };
type VariantAttributeValueRow = { attributeId: string; optionId: string; attribute: { code: string; name: string }; option: { code: string; label: string } };
type VariantRow = { id: string; sku: string; barcode: string | null; title: string | null; costPrice: bigint; salePrice: bigint; weightGrams: number | null; lengthCm?: number | null; widthCm?: number | null; heightCm?: number | null; isActive: boolean; status?: string; version?: number; createdAt: Date; updatedAt: Date; attributeValues?: VariantAttributeValueRow[] };
type ProductAttributeRow = { attributeId: string; isVariantAxis: boolean; isRequired: boolean; attribute: { code: string; name: string } };
type ProductDetailRow = { id: string; name: string; slug: string; description: string | null; status: ProductStatus; brandId: string | null; categoryId: string | null; createdAt: Date; updatedAt: Date; brand: BrandRow | null; category: CategoryRow | null; variants: VariantRow[]; attributes?: ProductAttributeRow[] };
type GenerationOption = { attributeId: string; attributeCode: string; attributeName: string; optionId: string; optionCode: string; optionLabel: string };
type GenerationCombination = { signature: string; values: GenerationOption[] };
type GenerationContext = { slug: string; axes: Array<{ id: string; code: string; name: string; options: GenerationOption[] }> };

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditLogService, private readonly idempotency: CatalogIdempotencyService) {}

  async listPublicProducts(query: Partial<ProductListQueryDto>): Promise<ProductListResponse> {
    return this.listProducts(query, false);
  }

  async listAdminProducts(query: Partial<ProductListQueryDto>): Promise<ProductListResponse> {
    return this.listProducts(query, true);
  }

  async getAdminProduct(id: string): Promise<ProductDetailResponse> {
    const product = await this.prisma.product.findUnique({ where: { id }, include: this.adminProductInclude() });
    if (!product) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Product not found.' });
    return { data: { product: this.productDetail(product) } };
  }

  async configureProductAttributes(actorId: string, id: string, input: ProductAttributeConfigurationUpdateDto): Promise<ProductDetailResponse> {
    const configurations = input.configurations.map(configuration => ({
      ...configuration,
      attributeCode: configuration.attributeCode.trim(),
      isRequired: configuration.isRequired ?? false,
    }));
    const codes = configurations.map(configuration => configuration.attributeCode);
    if (new Set(codes).size !== codes.length || configurations.some(configuration => configuration.isRequired && !configuration.isVariantAxis)) {
      throw new UnprocessableEntityException({ code: 'ATTRIBUTE_OPTION_INVALID', message: 'Product attribute configuration is invalid.' });
    }
    const result = await this.prisma.$transaction(async tx => {
      const current = await tx.product.findUnique({ where: { id }, include: this.adminProductInclude() });
      if (!current) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Product not found.' });
      if (current.version !== input.expectedVersion) throw new ConflictException({ code: 'STALE_VERSION', message: 'version conflict', details: { expected: input.expectedVersion, actual: current.version } });
      const attributes = codes.length ? await tx.attributeDefinition.findMany({ where: { code: { in: codes }, status: 'ACTIVE' }, select: { id: true, code: true } }) : [];
      if (attributes.length !== codes.length) throw new UnprocessableEntityException({ code: 'ATTRIBUTE_OPTION_INVALID', message: 'One or more attributes are invalid for this product.' });
      const byCode = new Map(attributes.map(attribute => [attribute.code, attribute.id]));
      const currentAxes = new Set(current.attributes.filter(attribute => attribute.isVariantAxis).map(attribute => attribute.attributeId));
      const nextAxes = new Set(configurations.filter(configuration => configuration.isVariantAxis).map(configuration => byCode.get(configuration.attributeCode)!));
      for (const attributeId of currentAxes) {
        if (!nextAxes.has(attributeId)) {
          const activeVariantCount = await tx.productVariantAttributeValue.count({ where: { attributeId, variant: { productId: id, status: 'ACTIVE' } } });
          if (activeVariantCount > 0) {
            const attribute = attributes.find(item => item.id === attributeId) ?? current.attributes.find(item => item.attributeId === attributeId)?.attribute;
            throw new ConflictException({ code: 'AXIS_IN_USE', message: `The ${attribute?.code ?? 'attribute'} axis is used by active variants.`, details: { productId: id, attributeCode: attribute?.code, activeVariantCount } });
          }
        }
      }
      await tx.productAttributeConfiguration.deleteMany({ where: { productId: id } });
      if (configurations.length) {
        await tx.productAttributeConfiguration.createMany({ data: configurations.map(configuration => ({ productId: id, attributeId: byCode.get(configuration.attributeCode)!, isVariantAxis: configuration.isVariantAxis, isRequired: configuration.isRequired })) });
      }
      const changed = await tx.product.updateMany({ where: { id, version: input.expectedVersion }, data: { version: { increment: 1 } } });
      if (changed.count !== 1) throw new ConflictException({ code: 'STALE_VERSION', message: 'version conflict', details: { expected: input.expectedVersion, actual: current.version } });
      const updated = await tx.product.findUniqueOrThrow({ where: { id }, include: this.adminProductInclude() });
      await this.audit.record({ actorId, action: 'catalog.product.attributes_configured', entityType: 'Product', entityId: id, requestId: getRequestId(), before: { version: current.version, attributeCount: current.attributes.length }, after: { version: updated.version, attributeCount: updated.attributes.length } }, tx);
      return updated;
    });
    return { data: { product: this.productDetail(result) } };
  }

  async previewVariantGeneration(id: string, input: VariantGeneratePreviewDto): Promise<VariantGeneratePreviewResponse> {
    const context = await this.loadGenerationContext(this.prisma, id);
    const combinations = this.buildCombinations(context, input.optionSelection);
    return { data: { combinations: combinations.map(combination => this.combinationPreview(combination)), total: combinations.length, limit: VARIANT_COMBINATION_LIMIT } };
  }

  async generateVariants(actorId: string, idempotencyKey: string, id: string, input: VariantGenerateDto): Promise<VariantGenerateResponse> {
    return this.idempotency.run({
      actorId, scope: `catalog.product.variants.generate:${id}`, key: idempotencyKey, payload: input,
      execute: async tx => {
        const context = await this.loadGenerationContext(tx, id);
        const combinations = this.buildCombinations(context, input.optionSelection);
        const created = [];
        for (const combination of combinations) {
          const sku = this.generatedSku(context.slug, combination);
          try {
            const variant = await tx.productVariant.create({ data: { productId: id, sku, skuKey: canonicalizeSku(sku), combinationSignature: combination.signature, title: this.generatedTitle(input.titlePattern, combination), costPrice: BigInt(input.costPrice.amount), salePrice: BigInt(input.salePrice.amount), isActive: true, status: 'ACTIVE', attributeValues: { create: combination.values.map(value => ({ attributeId: value.attributeId, optionId: value.optionId })) } }, include: { attributeValues: { include: { attribute: true, option: true } } } });
            created.push(variant);
          } catch (error) {
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
              const target = Array.isArray(error.meta?.target) ? error.meta.target as string[] : [];
              const code = target.some(field => field === 'sku' || field === 'skuKey') ? 'DUPLICATE_SKU' : 'DUPLICATE_VARIANT_COMBINATION';
              throw new ConflictException({ code, message: code === 'DUPLICATE_SKU' ? 'A generated SKU already exists.' : 'A variant combination already exists.' });
            }
            throw error;
          }
        }
        await this.audit.record({ actorId, action: 'catalog.product.variants_generated', entityType: 'Product', entityId: id, requestId: getRequestId(), after: { count: created.length } }, tx);
        return { response: { data: { variants: created.map(variant => this.variantResponse(variant)) } }, resourceType: 'Product', resourceId: id };
      },
    });
  }

  private async listProducts(query: Partial<ProductListQueryDto>, includeDrafts: boolean): Promise<ProductListResponse> {
    const page = Math.min(query.page || 1, 10_000);
    const perPage = Math.min(query.perPage || 25, 100);
    const status = includeDrafts ? statusesToDb(query.status) : [ProductStatus.ACTIVE];
    const where: Prisma.ProductWhereInput = {
      ...(status.length ? { status: { in: status } } : {}),
      ...(query.brandId ? { brandId: query.brandId } : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.search ? { OR: [{ name: { contains: query.search, mode: 'insensitive' } }, { slug: { contains: query.search, mode: 'insensitive' } }] } : {}),
    };
    const sortBy = query.sortBy && PRODUCT_SORT_FIELDS.has(query.sortBy) ? query.sortBy : 'createdAt';
    const sortDir = query.sortDir && ORDER_DIRECTIONS.has(query.sortDir) ? query.sortDir : 'desc';
    const [rows, total] = await Promise.all([
      this.prisma.product.findMany({ where, orderBy: { [sortBy]: sortDir }, skip: (page - 1) * perPage, take: perPage }),
      this.prisma.product.count({ where }),
    ]);
    return { data: { items: rows.map(row => this.productListItem(row)), meta: { page, perPage, total, pages: Math.ceil(total / perPage) } } };
  }

  async getPublicProduct(idOrSlug: string): Promise<ProductDetailPublicResponse> {
    const product = await this.prisma.product.findFirst({ where: { status: ProductStatus.ACTIVE, OR: [{ id: idOrSlug }, { slug: idOrSlug }] }, include: this.publicProductInclude() });
    if (!product) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Product not found.' });
    return { data: { product: this.productDetailPublic(product) } };
  }

  async createProduct(actorId: string, idempotencyKey: string, input: ProductCreateDto): Promise<ProductDetailResponse> {
    if (input.status === 'PUBLISHED' && (!input.variants || input.variants.length === 0)) {
      throw new ConflictException({ code: 'CONFLICT', message: 'A product must have a SKU before publishing.' });
    }
    const normalized = { ...input, name: input.name.trim(), description: input.description?.trim() };
    const idempotencyPayload = {
      name: normalized.name,
      slug: normalized.slug,
      description: normalized.description ?? null,
      brandId: normalized.brandId ?? null,
      categoryId: normalized.categoryId ?? null,
      status: normalized.status ?? 'DRAFT',
      variants: (normalized.variants ?? []).map(variant => ({
        sku: variant.sku,
        barcode: variant.barcode ?? null,
        title: variant.title ?? null,
        costPrice: variant.costPrice,
        salePrice: variant.salePrice,
        weightGrams: variant.weightGrams ?? null,
        isActive: variant.isActive ?? true,
      })),
    };
    return this.idempotency.run({
      actorId, scope: 'catalog.product.create', key: idempotencyKey, payload: idempotencyPayload,
      execute: async tx => {
        const singleVariant = normalized.variants?.length === 1;
        const created = await this.mapPrismaError(tx.product.create({
          data: {
            name: normalized.name, slug: normalized.slug, description: normalized.description, brandId: normalized.brandId, categoryId: normalized.categoryId,
            status: statusToDb(normalized.status) ?? ProductStatus.DRAFT,
            variants: normalized.variants ? { create: normalized.variants.map(variant => ({ sku: variant.sku, barcode: variant.barcode, title: variant.title, costPrice: BigInt(variant.costPrice.amount), salePrice: BigInt(variant.salePrice.amount), weightGrams: variant.weightGrams, isActive: variant.isActive ?? true, skuKey: canonicalizeSku(variant.sku), combinationSignature: singleVariant ? EMPTY_AXIS_SIGNATURE : pendingCombinationSignature() })) } : undefined,
          }, include: this.productInclude(),
        }), 'Product');
        if (normalized.variants && normalized.variants.length > 1) {
          for (const variant of created.variants) {
            await tx.productVariant.update({ where: { id: variant.id }, data: { combinationSignature: legacyCombinationSignature(variant.id) } });
          }
        }
        await this.audit.record({ actorId, action: 'catalog.product.created', entityType: 'Product', entityId: created.id, requestId: getRequestId(), after: { productId: created.id, status: created.status, variantCount: created.variants.length } }, tx);
        return { response: { data: { product: this.productDetail(created) } }, resourceType: 'Product', resourceId: created.id };
      },
    });
  }

  async changeProductStatus(actorId: string, idempotencyKey: string, id: string, input: ProductStatusDto): Promise<ProductStatusResponse> {
    const next = input.action === 'publish' ? ProductStatus.ACTIVE : input.action === 'archive' ? ProductStatus.ARCHIVED : ProductStatus.INACTIVE;
    return this.idempotency.run({
      actorId, scope: `catalog.product.status:${id}`, key: idempotencyKey, payload: { action: input.action },
      execute: async tx => {
      const current = await tx.product.findUnique({ where: { id }, include: this.productInclude() });
      if (!current) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Product not found.' });
       if (input.action === 'publish' && !current.variants.some(variant => variant.status === 'ACTIVE')) throw new UnprocessableEntityException({ code: 'UNPROCESSABLE', message: 'A product must have an active variant.' });
      const updated = await tx.product.update({ where: { id }, data: { status: next }, include: this.productInclude() });
      await this.audit.record({ actorId, action: 'catalog.product.status_changed', entityType: 'Product', entityId: id, requestId: getRequestId(), before: { status: current.status }, after: { status: updated.status } }, tx);
      return { response: { data: { product: this.productDetail(updated) } }, resourceType: 'Product', resourceId: id };
      },
    });
  }

  async listAttributes(): Promise<AttributeListResponse> {
    const attributes = await this.prisma.attributeDefinition.findMany({ orderBy: { code: 'asc' }, include: { _count: { select: { options: true } } } });
    return { data: { items: attributes.map(attribute => this.attributeSummary(attribute)) } };
  }

  async createAttribute(actorId: string, idempotencyKey: string, input: AttributeDefinitionCreateDto): Promise<AttributeDefinitionResponse> {
    const normalized = { ...input, code: input.code.trim(), name: input.name.trim(), description: input.description?.trim() };
    return this.idempotency.run({
      actorId, scope: 'catalog.attribute.create', key: idempotencyKey, payload: normalized,
      execute: async tx => {
        const created = await this.mapPrismaError(tx.attributeDefinition.create({
          data: {
            code: normalized.code, name: normalized.name, description: normalized.description,
            status: normalized.status ?? 'ACTIVE',
            options: normalized.options ? { create: normalized.options.map(option => ({ code: option.code.trim(), label: option.label.trim(), status: option.status ?? 'ACTIVE' })) } : undefined,
          }, include: { options: { orderBy: { code: 'asc' } }, _count: { select: { options: true } } },
        }), 'Attribute');
        await this.audit.record({ actorId, action: 'catalog.attribute.created', entityType: 'AttributeDefinition', entityId: created.id, requestId: getRequestId(), after: { code: created.code, optionCount: created.options.length } }, tx);
        return { response: { data: { attribute: this.attributeDetail(created) } }, resourceType: 'AttributeDefinition', resourceId: created.id };
      },
    });
  }

  async updateAttribute(actorId: string, id: string, input: AttributeDefinitionUpdateDto): Promise<AttributeDefinitionResponse> {
    const result = await this.prisma.$transaction(async tx => {
      const current = await tx.attributeDefinition.findUnique({ where: { id }, include: { options: { orderBy: { code: 'asc' } }, _count: { select: { options: true } } } });
      if (!current) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Attribute not found.' });
      if (current.version !== input.expectedVersion) throw new ConflictException({ code: 'STALE_VERSION', message: 'version conflict', details: { expected: input.expectedVersion, actual: current.version } });
      const changed = await tx.attributeDefinition.updateMany({ where: { id, version: input.expectedVersion }, data: { ...(input.name !== undefined ? { name: input.name.trim() } : {}), ...(input.description !== undefined ? { description: input.description?.trim() ?? null } : {}), ...(input.status !== undefined ? { status: input.status } : {}), version: { increment: 1 } } });
      if (changed.count !== 1) throw new ConflictException({ code: 'STALE_VERSION', message: 'version conflict', details: { expected: input.expectedVersion, actual: current.version } });
      const updated = await tx.attributeDefinition.findUniqueOrThrow({ where: { id }, include: { options: { orderBy: { code: 'asc' } }, _count: { select: { options: true } } } });
      await this.audit.record({ actorId, action: 'catalog.attribute.updated', entityType: 'AttributeDefinition', entityId: id, requestId: getRequestId(), before: { version: current.version }, after: { version: updated.version } }, tx);
      return updated;
    });
    return { data: { attribute: this.attributeDetail(result) } };
  }

  async createAttributeOption(actorId: string, idempotencyKey: string, attributeId: string, input: AttributeOptionCreateDto): Promise<AttributeOptionResponse> {
    const normalized = { ...input, code: input.code.trim(), label: input.label.trim() };
    return this.idempotency.run({
      actorId, scope: `catalog.attribute.option.create:${attributeId}`, key: idempotencyKey, payload: normalized,
      execute: async tx => {
        const attribute = await tx.attributeDefinition.findUnique({ where: { id: attributeId }, select: { id: true } });
        if (!attribute) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Attribute not found.' });
        const created = await this.mapPrismaError(tx.attributeOption.create({ data: { attributeId, code: normalized.code, label: normalized.label, status: normalized.status ?? 'ACTIVE' } }), 'Option');
        await this.audit.record({ actorId, action: 'catalog.attribute.option.created', entityType: 'AttributeOption', entityId: created.id, requestId: getRequestId(), after: { attributeId, code: created.code } }, tx);
        return { response: { data: { option: this.optionSummary(created) } }, resourceType: 'AttributeOption', resourceId: created.id };
      },
    });
  }

  async updateAttributeOption(actorId: string, attributeId: string, optionId: string, input: AttributeOptionUpdateDto): Promise<AttributeOptionResponse> {
    const result = await this.prisma.$transaction(async tx => {
      const current = await tx.attributeOption.findFirst({ where: { id: optionId, attributeId } });
      if (!current) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Attribute option not found.' });
      if (current.version !== input.expectedVersion) throw new ConflictException({ code: 'STALE_VERSION', message: 'version conflict', details: { expected: input.expectedVersion, actual: current.version } });
      const changed = await tx.attributeOption.updateMany({ where: { id: optionId, version: input.expectedVersion }, data: { ...(input.label !== undefined ? { label: input.label.trim() } : {}), ...(input.status !== undefined ? { status: input.status } : {}), version: { increment: 1 } } });
      if (changed.count !== 1) throw new ConflictException({ code: 'STALE_VERSION', message: 'version conflict', details: { expected: input.expectedVersion, actual: current.version } });
      const updated = await tx.attributeOption.findUniqueOrThrow({ where: { id: optionId } });
      await this.audit.record({ actorId, action: 'catalog.attribute.option.updated', entityType: 'AttributeOption', entityId: optionId, requestId: getRequestId(), before: { version: current.version }, after: { version: updated.version } }, tx);
      return updated;
    });
    return { data: { option: this.optionSummary(result) } };
  }

  async updateVariant(actorId: string, id: string, input: ProductVariantUpdateDto): Promise<ProductVariantResponse> {
    if (input.sku !== undefined) throw new ConflictException({ code: 'SKU_CHANGE_NOT_ALLOWED', message: 'SKU cannot be changed through an ordinary variant update.' });
    const result = await this.prisma.$transaction(async tx => {
      const current = await tx.productVariant.findUnique({ where: { id } });
      if (!current) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Variant not found.' });
      if (current.version !== input.expectedVersion) throw new ConflictException({ code: 'STALE_VERSION', message: 'version conflict', details: { expected: input.expectedVersion, actual: current.version } });
      const changed = await tx.productVariant.updateMany({ where: { id, version: input.expectedVersion }, data: { ...(input.barcode !== undefined ? { barcode: input.barcode?.trim() || null } : {}), ...(input.title !== undefined ? { title: input.title?.trim() || null } : {}), ...(input.weightGrams !== undefined ? { weightGrams: input.weightGrams } : {}), ...(input.lengthCm !== undefined ? { lengthCm: input.lengthCm } : {}), ...(input.widthCm !== undefined ? { widthCm: input.widthCm } : {}), ...(input.heightCm !== undefined ? { heightCm: input.heightCm } : {}), version: { increment: 1 } } });
      if (changed.count !== 1) throw new ConflictException({ code: 'STALE_VERSION', message: 'version conflict', details: { expected: input.expectedVersion, actual: current.version } });
      const updated = await tx.productVariant.findUniqueOrThrow({ where: { id } });
      await this.audit.record({ actorId, action: 'catalog.variant.updated', entityType: 'ProductVariant', entityId: id, requestId: getRequestId(), before: { version: current.version }, after: { version: updated.version } }, tx);
      return updated;
    });
    return { data: { variant: this.variantResponse(result) } };
  }

  async updateVariantStatus(actorId: string, idempotencyKey: string, id: string, input: ProductVariantStatusDto): Promise<ProductVariantResponse> {
    return this.idempotency.run({
      actorId, scope: `catalog.variant.status:${id}`, key: idempotencyKey, payload: input,
      execute: async tx => {
        const current = await tx.productVariant.findUnique({ where: { id } });
        if (!current) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Variant not found.' });
        if (current.version !== input.expectedVersion) throw new ConflictException({ code: 'STALE_VERSION', message: 'version conflict', details: { expected: input.expectedVersion, actual: current.version } });
        const changed = await tx.productVariant.updateMany({ where: { id, version: input.expectedVersion }, data: { status: input.status, isActive: input.status === 'ACTIVE', version: { increment: 1 } } });
        if (changed.count !== 1) throw new ConflictException({ code: 'STALE_VERSION', message: 'version conflict', details: { expected: input.expectedVersion, actual: current.version } });
        const updated = await tx.productVariant.findUniqueOrThrow({ where: { id } });
        await this.audit.record({ actorId, action: 'catalog.variant.status_changed', entityType: 'ProductVariant', entityId: id, requestId: getRequestId(), before: { status: current.status, version: current.version }, after: { status: updated.status, version: updated.version } }, tx);
        return { response: { data: { variant: this.variantResponse(updated) } }, resourceType: 'ProductVariant', resourceId: id };
      },
    });
  }

  async updateVariantPrice(actorId: string, id: string, input: VariantPriceUpdateDto): Promise<VariantPriceResponse> {
    const result = await this.prisma.$transaction(async tx => {
      const current = await tx.productVariant.findUnique({ where: { id } });
      if (!current) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Variant not found.' });
      if (current.version !== input.expectedVersion) throw new ConflictException({ code: 'STALE_VERSION', message: 'version conflict', details: { expected: input.expectedVersion, actual: current.version } });
      const changed = await tx.productVariant.updateMany({ where: { id, version: input.expectedVersion }, data: { costPrice: BigInt(input.costPrice.amount), salePrice: BigInt(input.salePrice.amount), version: { increment: 1 } } });
      if (changed.count !== 1) throw new ConflictException({ code: 'STALE_VERSION', message: 'version conflict', details: { expected: input.expectedVersion, actual: current.version } });
      const updated = await tx.productVariant.findUniqueOrThrow({ where: { id } });
      const record = await tx.variantPriceRecord.create({ data: { variantId: id, costPrice: updated.costPrice, salePrice: updated.salePrice, effectiveAt: input.effectiveAt ? new Date(input.effectiveAt) : new Date(), source: 'ADMIN', actorUserId: actorId, reason: input.reason?.trim() || null, requestId: getRequestId() } });
      await this.audit.record({ actorId, action: 'catalog.variant.price_changed', entityType: 'ProductVariant', entityId: id, requestId: getRequestId(), before: { version: current.version, costPrice: current.costPrice.toString(), salePrice: current.salePrice.toString() }, after: { version: updated.version, costPrice: updated.costPrice.toString(), salePrice: updated.salePrice.toString(), priceRecordId: record.id } }, tx);
      return { updated, record };
    });
    return { data: { variant: this.variantResponse(result.updated), record: this.priceRecordResponse(result.record) } };
  }

  async variantPriceHistory(id: string): Promise<VariantPriceHistoryResponse> {
    const variant = await this.prisma.productVariant.findUnique({ where: { id }, select: { id: true } });
    if (!variant) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Variant not found.' });
    const items = await this.prisma.variantPriceRecord.findMany({ where: { variantId: id }, orderBy: { effectiveAt: 'desc' }, take: 100 });
    return { data: { items: items.map(record => this.priceRecordResponse(record)), meta: { page: 1, perPage: 100, total: items.length, pages: items.length ? 1 : 0 } } };
  }

  async createBrand(actorId: string, idempotencyKey: string, input: BrandCreateDto): Promise<BrandResponse> {
    const normalized = { ...input, name: input.name.trim() };
    return this.idempotency.run({
      actorId, scope: 'catalog.brand.create', key: idempotencyKey, payload: normalized,
      execute: async tx => {
      const created = await this.mapPrismaError(tx.brand.create({ data: { name: normalized.name, slug: normalized.slug }, include: { _count: { select: { products: true } } } }), 'Brand');
      await this.audit.record({ actorId, action: 'catalog.brand.created', entityType: 'Brand', entityId: created.id, requestId: getRequestId(), after: { name: created.name, slug: created.slug } }, tx);
      return { response: { data: { brand: { id: created.id, name: created.name, slug: created.slug, productCount: created._count.products } } }, resourceType: 'Brand', resourceId: created.id };
      },
    });
  }

  async updateBrand(actorId: string, id: string, input: BrandUpdateDto): Promise<BrandResponse> {
    const brand = await this.mapPrismaError(this.prisma.$transaction(async tx => {
      const updated = await tx.brand.update({ where: { id }, data: { ...(input.name ? { name: input.name.trim() } : {}), ...(input.slug ? { slug: input.slug } : {}) }, include: { _count: { select: { products: true } } } });
      await this.audit.record({ actorId, action: 'catalog.brand.updated', entityType: 'Brand', entityId: id, requestId: getRequestId(), after: { name: updated.name, slug: updated.slug } }, tx);
      return updated;
    }), 'Brand');
    return { data: { brand: { id: brand.id, name: brand.name, slug: brand.slug, productCount: brand._count.products } } };
  }

  async listBrands(): Promise<BrandListResponse> {
    const brands = await this.prisma.brand.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { products: { where: { status: ProductStatus.ACTIVE } } } } } });
    return { data: { items: brands.map(brand => ({ id: brand.id, name: brand.name, slug: brand.slug, productCount: brand._count.products })) } };
  }

  async createCategory(actorId: string, idempotencyKey: string, input: CategoryCreateDto): Promise<CategoryResponse> {
    const normalized = { ...input, name: input.name.trim() };
    return this.idempotency.run({
      actorId, scope: 'catalog.category.create', key: idempotencyKey, payload: normalized,
      execute: async tx => {
      const created = await this.mapPrismaError(tx.category.create({ data: { name: normalized.name, slug: normalized.slug, parentId: normalized.parentId }, include: this.categoryInclude() }), 'Category');
      await this.audit.record({ actorId, action: 'catalog.category.created', entityType: 'Category', entityId: created.id, requestId: getRequestId(), after: { name: created.name, slug: created.slug } }, tx);
      return { response: { data: { category: this.categoryNode(created) } }, resourceType: 'Category', resourceId: created.id };
      },
    });
  }

  async updateCategory(actorId: string, id: string, input: CategoryUpdateDto): Promise<CategoryResponse> {
    const category = await this.mapPrismaError(this.prisma.$transaction(async tx => {
      if (input.parentId !== undefined && input.parentId !== null) {
        await this.assertCategoryParentDoesNotCreateCycle(tx, id, input.parentId);
      }
      const updated = await tx.category.update({ where: { id }, data: { ...(input.name ? { name: input.name.trim() } : {}), ...(input.slug ? { slug: input.slug } : {}), ...(input.parentId !== undefined ? { parentId: input.parentId } : {}) }, include: this.categoryInclude() });
      await this.audit.record({ actorId, action: 'catalog.category.updated', entityType: 'Category', entityId: id, requestId: getRequestId(), after: { name: updated.name, slug: updated.slug } }, tx);
      return updated;
    }), 'Category');
    return { data: { category: this.categoryNode(category) } };
  }

  async listCategories(): Promise<CategoryListResponse> {
    const categories = await this.prisma.category.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { products: { where: { status: ProductStatus.ACTIVE } } } } } });
    return { data: { items: categories.map(category => ({ id: category.id, name: category.name, slug: category.slug, parentId: category.parentId, productCount: category._count.products })) } };
  }

  async categoryTree(): Promise<CategoryTreeResponse> {
    const rows = await this.prisma.category.findMany({ orderBy: { name: 'asc' }, include: { children: true } });
    const nodes = new Map<string, CategoryTreeNode>(rows.map(row => [row.id, { id: row.id, name: row.name, slug: row.slug, parentId: row.parentId, children: [], createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() }]));
    for (const node of nodes.values()) if (node.parentId && nodes.has(node.parentId)) nodes.get(node.parentId)!.children.push(node);
    return { data: { tree: [...nodes.values()].filter(node => node.parentId === null) } };
  }

  private productInclude() { return { brand: { include: { _count: { select: { products: true } } } }, category: { include: { _count: { select: { products: true } } } }, variants: true } as const; }
  private adminProductInclude() { return { brand: { include: { _count: { select: { products: true } } } }, category: { include: { _count: { select: { products: true } } } }, attributes: { include: { attribute: { select: { code: true, name: true } } }, orderBy: { attribute: { code: 'asc' as const } } }, variants: { include: { attributeValues: { include: { attribute: { select: { code: true, name: true } }, option: { select: { code: true, label: true } } } } } } } as const; }
  private publicProductInclude() { return { brand: { include: { _count: { select: { products: { where: { status: ProductStatus.ACTIVE } } } } } }, category: { include: { _count: { select: { products: { where: { status: ProductStatus.ACTIVE } } } } } }, variants: { where: { isActive: true } } } as const; }
  private categoryInclude() { return { children: true } as const; }
  private productListItem(row: { id: string; name: string; slug: string; status: ProductStatus; brandId: string | null; categoryId: string | null; createdAt: Date; updatedAt: Date }) { return { id: row.id, name: row.name, slug: row.slug, status: statusToApi(row.status), brandId: row.brandId, categoryId: row.categoryId, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() }; }
  private categoryNode(row: CategoryInput): CategoryTreeNode { return { id: row.id, name: row.name, slug: row.slug, parentId: row.parentId, children: (row.children ?? []).map(child => this.categoryNode(child)), createdAt: new Date(row.createdAt).toISOString(), updatedAt: new Date(row.updatedAt).toISOString() }; }
  private productDetail(row: ProductDetailRow) { return { ...this.productListItem(row), description: row.description, brand: row.brand ? { id: row.brand.id, name: row.brand.name, slug: row.brand.slug, productCount: row.brand._count.products } : null, category: row.category ? { id: row.category.id, name: row.category.name, slug: row.category.slug, parentId: row.category.parentId, productCount: row.category._count.products } : null, attributes: row.attributes?.map(attribute => ({ attributeCode: attribute.attribute.code, attributeName: attribute.attribute.name, isVariantAxis: attribute.isVariantAxis, isRequired: attribute.isRequired })), variants: row.variants.map(variant => this.productVariantPrivateDetail(variant)) }; }
  private productDetailPublic(row: ProductDetailRow) { return { ...this.productListItem(row), description: row.description, brand: row.brand ? { id: row.brand.id, name: row.brand.name, slug: row.brand.slug, productCount: row.brand._count.products } : null, category: row.category ? { id: row.category.id, name: row.category.name, slug: row.category.slug, parentId: row.category.parentId, productCount: row.category._count.products } : null, variants: row.variants.map(variant => this.productVariantPublic(variant)) }; }
  private productVariantPublic(variant: VariantRow) { return { id: variant.id, sku: variant.sku, title: variant.title ?? undefined, salePrice: { amount: variant.salePrice.toString(), currency: 'IRR' as const }, weightGrams: variant.weightGrams ?? undefined, isActive: variant.isActive, createdAt: variant.createdAt.toISOString(), updatedAt: variant.updatedAt.toISOString() }; }
  private productVariantBase(variant: VariantRow) { return { id: variant.id, sku: variant.sku, barcode: variant.barcode ?? undefined, title: variant.title ?? undefined, salePrice: { amount: variant.salePrice.toString(), currency: 'IRR' as const }, weightGrams: variant.weightGrams ?? undefined, isActive: variant.isActive, createdAt: variant.createdAt.toISOString(), updatedAt: variant.updatedAt.toISOString() }; }
  private productVariantPrivateDetail(variant: VariantRow) { return { ...this.productVariantBase(variant), costPrice: { amount: variant.costPrice.toString(), currency: 'IRR' as const }, attributeValues: variant.attributeValues?.map(value => ({ attributeCode: value.attribute.code, attributeName: value.attribute.name, optionCode: value.option.code, optionLabel: value.option.label, isVariantAxis: true })) }; }
  private variantResponse(variant: { id: string; sku: string; barcode?: string | null; title?: string | null; costPrice: bigint; salePrice: bigint; weightGrams?: number | null; lengthCm?: number | null; widthCm?: number | null; heightCm?: number | null; status: string; isActive: boolean; version: number; createdAt: Date; updatedAt: Date; attributeValues?: VariantAttributeValueRow[] }) {
    return { id: variant.id, sku: variant.sku, barcode: variant.barcode ?? undefined, title: variant.title ?? undefined, costPrice: { amount: variant.costPrice.toString(), currency: 'IRR' as const }, salePrice: { amount: variant.salePrice.toString(), currency: 'IRR' as const }, weightGrams: variant.weightGrams ?? undefined, dimensions: { lengthCm: variant.lengthCm ?? undefined, widthCm: variant.widthCm ?? undefined, heightCm: variant.heightCm ?? undefined }, status: variant.status as 'ACTIVE' | 'INACTIVE' | 'ARCHIVED', isActive: variant.isActive, version: variant.version, attributeValues: variant.attributeValues?.map(value => ({ attributeCode: value.attribute.code, attributeName: value.attribute.name, optionCode: value.option.code, optionLabel: value.option.label, isVariantAxis: true })), createdAt: variant.createdAt.toISOString(), updatedAt: variant.updatedAt.toISOString() };
  }
  private priceRecordResponse(record: { id: string; variantId: string; costPrice: bigint; salePrice: bigint; effectiveAt: Date; source: string; actorUserId: string | null; reason: string | null; requestId: string | null; createdAt: Date }) {
    return { id: record.id, variantId: record.variantId, costPrice: { amount: record.costPrice.toString(), currency: 'IRR' as const }, salePrice: { amount: record.salePrice.toString(), currency: 'IRR' as const }, effectiveAt: record.effectiveAt.toISOString(), source: record.source as 'ADMIN' | 'IMPORT' | 'SYSTEM', actorUserId: record.actorUserId, reason: record.reason, requestId: record.requestId, createdAt: record.createdAt.toISOString() };
  }
  private attributeSummary(attribute: { id: string; code: string; name: string; description: string | null; status: string; version: number; createdAt: Date; updatedAt: Date; _count: { options: number } }) {
    return { id: attribute.id, code: attribute.code, name: attribute.name, description: attribute.description, status: attribute.status as 'ACTIVE' | 'INACTIVE', optionCount: attribute._count.options, version: attribute.version, createdAt: attribute.createdAt.toISOString(), updatedAt: attribute.updatedAt.toISOString() };
  }
  private optionSummary(option: { id: string; code: string; label: string; status: string; version: number; createdAt: Date; updatedAt: Date }) {
    return { id: option.id, code: option.code, label: option.label, status: option.status as 'ACTIVE' | 'INACTIVE', version: option.version, createdAt: option.createdAt.toISOString(), updatedAt: option.updatedAt.toISOString() };
  }
  private attributeDetail(attribute: { id: string; code: string; name: string; description: string | null; status: string; version: number; createdAt: Date; updatedAt: Date; _count: { options: number }; options: Array<{ id: string; code: string; label: string; status: string; version: number; createdAt: Date; updatedAt: Date }> }) {
    return { ...this.attributeSummary(attribute), options: attribute.options.map(option => this.optionSummary(option)) };
  }
  private async loadGenerationContext(client: PrismaService | Prisma.TransactionClient, productId: string): Promise<GenerationContext> {
    const product = await client.product.findUnique({ where: { id: productId }, select: { slug: true, attributes: { where: { isVariantAxis: true, attribute: { status: 'ACTIVE' } }, orderBy: { attribute: { code: 'asc' } }, include: { attribute: { include: { options: { where: { status: 'ACTIVE' }, orderBy: { code: 'asc' } } } } } } } });
    if (!product) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Product not found.' });
    return { slug: product.slug, axes: product.attributes.map(axis => ({ id: axis.attribute.id, code: axis.attribute.code, name: axis.attribute.name, options: axis.attribute.options.map(option => ({ attributeId: axis.attribute.id, attributeCode: axis.attribute.code, attributeName: axis.attribute.name, optionId: option.id, optionCode: option.code, optionLabel: option.label })) })) };
  }
  private buildCombinations(context: GenerationContext, selection: Record<string, string[]>): GenerationCombination[] {
    if (!selection || typeof selection !== 'object' || Array.isArray(selection)) throw new UnprocessableEntityException({ code: 'ATTRIBUTE_OPTION_INVALID', message: 'optionSelection must be an object.' });
    const axisCodes = new Set(context.axes.map(axis => axis.code));
    const selectionCodes = Object.keys(selection);
    if (selectionCodes.some(code => !axisCodes.has(code)) || selectionCodes.length !== context.axes.length || context.axes.some(axis => !Array.isArray(selection[axis.code]) || selection[axis.code].length === 0)) {
      throw new UnprocessableEntityException({ code: 'ATTRIBUTE_OPTION_INVALID', message: 'optionSelection must contain one non-empty selection for every variant axis.' });
    }
    let combinations: GenerationOption[][] = [[]];
    for (const axis of context.axes) {
      const selected = new Set(selection[axis.code]);
      const options = axis.options.filter(option => selected.has(option.optionCode));
      if (options.length !== selected.size) throw new UnprocessableEntityException({ code: 'ATTRIBUTE_OPTION_INVALID', message: `One or more options are invalid for the ${axis.code} axis.` });
      combinations = combinations.flatMap(current => options.map(option => [...current, option]));
      if (combinations.length > VARIANT_COMBINATION_LIMIT) throw new UnprocessableEntityException({ code: 'COMBINATION_LIMIT_EXCEEDED', message: `Variant generation exceeds the ${VARIANT_COMBINATION_LIMIT} combination limit.`, details: { limit: VARIANT_COMBINATION_LIMIT } });
    }
    return combinations.map(values => ({ values, signature: combinationSignature(values.map(value => ({ attributeId: value.attributeId, optionId: value.optionId }))) }));
  }
  private combinationPreview(combination: GenerationCombination) {
    return { label: combination.values.map(value => `${value.attributeName}: ${value.optionLabel}`).join(' / ') || 'Default', combinationSignature: combination.signature, attributeValues: combination.values.map(value => ({ attributeCode: value.attributeCode, attributeName: value.attributeName, optionCode: value.optionCode, optionLabel: value.optionLabel, isVariantAxis: true })) };
  }
  private generatedSku(slug: string, combination: GenerationCombination) {
    return [slug, ...combination.values.map(value => value.optionCode)].join('-');
  }
  private generatedTitle(pattern: string | undefined, combination: GenerationCombination) {
    const labels = new Map(combination.values.map(value => [value.attributeCode, value.optionLabel]));
    return pattern?.replace(/\{([a-z0-9-]+)\}/gu, (_match, code: string) => labels.get(code) ?? '') || combination.values.map(value => value.optionLabel).join(' / ') || null;
  }
  private async assertCategoryParentDoesNotCreateCycle(tx: Prisma.TransactionClient, categoryId: string, parentId: string): Promise<void> {
    const visited = new Set<string>();
    let cursor: string | null = parentId;
    while (cursor) {
      if (cursor === categoryId || visited.has(cursor)) {
        throw new ConflictException({ code: 'CONFLICT', message: 'A category parent cannot create a hierarchy cycle.' });
      }
      visited.add(cursor);
      const parent: { parentId: string | null } | null = await tx.category.findUnique({ where: { id: cursor }, select: { parentId: true } });
      if (!parent) {
        throw new UnprocessableEntityException({ code: 'INVALID_REFERENCE', message: 'Category references an invalid parent.' });
      }
      cursor = parent.parentId;
    }
  }
  private async mapPrismaError<T>(operation: Promise<T>, resource: 'Brand' | 'Category' | 'Product' | 'Attribute' | 'Option'): Promise<T> {
    try {
      return await operation;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const fields = Array.isArray(error.meta?.target) ? (error.meta.target as string[]).join(', ') : 'unique value';
        const article = resource === 'Attribute' || resource === 'Option' ? 'An' : 'A';
        throw new ConflictException({ code: 'CONFLICT', message: `${article} ${resource.toLowerCase()} with that ${fields} already exists.` });
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException({ code: 'NOT_FOUND', message: `${resource} not found.` });
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        throw new UnprocessableEntityException({ code: 'INVALID_REFERENCE', message: `${resource} references an invalid related resource.` });
      }
      throw error;
    }
  }
}
