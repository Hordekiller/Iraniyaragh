import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ProductStatus } from '@prisma/client';
import type {
  BrandListResponse, BrandResponse, CategoryListResponse, CategoryResponse, CategoryTreeResponse,
  ProductDetailPublicResponse, ProductDetailResponse, ProductListResponse, ProductStatusResponse,
} from '@iranyaragh/contracts';
import { getRequestId } from '../../common/request-context';
import { PrismaService } from '../../database/prisma.service';
import { AuditLogService } from '../audit/audit-log.service';
import type { BrandCreateDto, BrandUpdateDto, CategoryCreateDto, CategoryUpdateDto, ProductCreateDto, ProductListQueryDto, ProductStatusDto } from './catalog.dto';

const statusToDb = (status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED' | undefined): ProductStatus | undefined =>
  status === 'PUBLISHED' ? ProductStatus.ACTIVE : status;
const statusesToDb = (status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED' | undefined): ProductStatus[] =>
  status === 'DRAFT' ? [ProductStatus.DRAFT, ProductStatus.INACTIVE] : status === 'PUBLISHED' ? [ProductStatus.ACTIVE] : status === 'ARCHIVED' ? [ProductStatus.ARCHIVED] : [];
const statusToApi = (status: ProductStatus): 'DRAFT' | 'PUBLISHED' | 'ARCHIVED' =>
  status === ProductStatus.ACTIVE ? 'PUBLISHED' : status === ProductStatus.ARCHIVED ? 'ARCHIVED' : 'DRAFT';
const PRODUCT_SORT_FIELDS = { name: 'name', createdAt: 'createdAt', updatedAt: 'updatedAt' } as const;
const ORDER_DIRECTIONS = { asc: 'asc', desc: 'desc' } as const;

type CategoryTreeNode = { id: string; name: string; slug: string; parentId: string | null; children: CategoryTreeNode[]; createdAt: string; updatedAt: string };
type CategoryInput = { id: string; name: string; slug: string; parentId: string | null; createdAt: Date | string; updatedAt: Date | string; children?: CategoryInput[] };
type BrandRow = { id: string; name: string; slug: string; _count: { products: number } };
type CategoryRow = { id: string; name: string; slug: string; parentId: string | null; _count: { products: number } };
type VariantRow = { id: string; sku: string; barcode: string | null; title: string | null; costPrice: bigint; salePrice: bigint; weightGrams: number | null; isActive: boolean; createdAt: Date; updatedAt: Date };
type ProductDetailRow = { id: string; name: string; slug: string; description: string | null; status: ProductStatus; brandId: string | null; categoryId: string | null; createdAt: Date; updatedAt: Date; brand: BrandRow | null; category: CategoryRow | null; variants: VariantRow[] };

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditLogService) {}

  async listPublicProducts(query: Partial<ProductListQueryDto>): Promise<ProductListResponse> {
    return this.listProducts(query, false);
  }

  async listAdminProducts(query: Partial<ProductListQueryDto>): Promise<ProductListResponse> {
    return this.listProducts(query, true);
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
    const sortBy = query.sortBy && query.sortBy in PRODUCT_SORT_FIELDS ? query.sortBy : 'createdAt';
    const sortDir = query.sortDir && query.sortDir in ORDER_DIRECTIONS ? query.sortDir : 'desc';
    const [rows, total] = await Promise.all([
      this.prisma.product.findMany({ where, orderBy: { [sortBy]: sortDir }, skip: (page - 1) * perPage, take: perPage }),
      this.prisma.product.count({ where }),
    ]);
    return { data: { items: rows.map(row => this.productListItem(row)), meta: { page, perPage, total, pages: Math.ceil(total / perPage) } } };
  }

  async getPublicProduct(idOrSlug: string): Promise<ProductDetailPublicResponse> {
    const product = await this.prisma.product.findFirst({ where: { status: ProductStatus.ACTIVE, OR: [{ id: idOrSlug }, { slug: idOrSlug }] }, include: this.productInclude() });
    if (!product) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Product not found.' });
    return { data: { product: this.productDetailPublic(product) } };
  }

  async createProduct(actorId: string, input: ProductCreateDto): Promise<ProductDetailResponse> {
    const product = await this.mapPrismaError(this.prisma.$transaction(async tx => {
      const created = await tx.product.create({
        data: {
          name: input.name.trim(), slug: input.slug, description: input.description?.trim(), brandId: input.brandId, categoryId: input.categoryId,
          status: statusToDb(input.status) ?? ProductStatus.DRAFT,
          variants: input.variants ? { create: input.variants.map(variant => ({ sku: variant.sku, barcode: variant.barcode, title: variant.title, costPrice: BigInt(variant.costPrice.amount), salePrice: BigInt(variant.salePrice.amount), weightGrams: variant.weightGrams, isActive: variant.isActive ?? true })) } : undefined,
        }, include: this.productInclude(),
      });
      await this.audit.record({ actorId, action: 'catalog.product.created', entityType: 'Product', entityId: created.id, requestId: getRequestId(), after: { productId: created.id, status: created.status, variantCount: created.variants.length } }, tx);
      return created;
    }), 'Product');
    return { data: { product: this.productDetail(product) } };
  }

  async changeProductStatus(actorId: string, id: string, input: ProductStatusDto): Promise<ProductStatusResponse> {
    const next = input.action === 'publish' ? ProductStatus.ACTIVE : input.action === 'archive' ? ProductStatus.ARCHIVED : ProductStatus.INACTIVE;
    const product = await this.prisma.$transaction(async tx => {
      const current = await tx.product.findUnique({ where: { id }, include: this.productInclude() });
      if (!current) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Product not found.' });
      if (input.action === 'publish' && current.variants.length === 0) throw new ConflictException({ code: 'CONFLICT', message: 'A product must have a SKU before publishing.' });
      const updated = await tx.product.update({ where: { id }, data: { status: next }, include: this.productInclude() });
      await this.audit.record({ actorId, action: 'catalog.product.status_changed', entityType: 'Product', entityId: id, requestId: getRequestId(), before: { status: current.status }, after: { status: updated.status } }, tx);
      return updated;
    });
    return { data: { product: this.productDetail(product) } };
  }

  async createBrand(actorId: string, input: BrandCreateDto): Promise<BrandResponse> {
    const brand = await this.mapPrismaError(this.prisma.brand.create({ data: { name: input.name.trim(), slug: input.slug }, include: { _count: { select: { products: true } } } }), 'Brand');
    await this.audit.record({ actorId, action: 'catalog.brand.created', entityType: 'Brand', entityId: brand.id, requestId: getRequestId(), after: { name: brand.name, slug: brand.slug } });
    return { data: { brand: { id: brand.id, name: brand.name, slug: brand.slug, productCount: brand._count.products } } };
  }

  async updateBrand(actorId: string, id: string, input: BrandUpdateDto): Promise<BrandResponse> {
    const brand = await this.mapPrismaError(this.prisma.brand.update({ where: { id }, data: { ...(input.name ? { name: input.name.trim() } : {}), ...(input.slug ? { slug: input.slug } : {}) }, include: { _count: { select: { products: true } } } }), 'Brand');
    await this.audit.record({ actorId, action: 'catalog.brand.updated', entityType: 'Brand', entityId: id, requestId: getRequestId(), after: { name: brand.name, slug: brand.slug } });
    return { data: { brand: { id: brand.id, name: brand.name, slug: brand.slug, productCount: brand._count.products } } };
  }

  async listBrands(): Promise<BrandListResponse> {
    const brands = await this.prisma.brand.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { products: true } } } });
    return { data: { items: brands.map(brand => ({ id: brand.id, name: brand.name, slug: brand.slug, productCount: brand._count.products })) } };
  }

  async createCategory(actorId: string, input: CategoryCreateDto): Promise<CategoryResponse> {
    const category = await this.mapPrismaError(this.prisma.category.create({ data: { name: input.name.trim(), slug: input.slug, parentId: input.parentId }, include: this.categoryInclude() }), 'Category');
    await this.audit.record({ actorId, action: 'catalog.category.created', entityType: 'Category', entityId: category.id, requestId: getRequestId(), after: { name: category.name, slug: category.slug } });
    return { data: { category: this.categoryNode(category) } };
  }

  async updateCategory(actorId: string, id: string, input: CategoryUpdateDto): Promise<CategoryResponse> {
    const category = await this.mapPrismaError(this.prisma.category.update({ where: { id }, data: { ...(input.name ? { name: input.name.trim() } : {}), ...(input.slug ? { slug: input.slug } : {}), ...(input.parentId !== undefined ? { parentId: input.parentId } : {}) }, include: this.categoryInclude() }), 'Category');
    await this.audit.record({ actorId, action: 'catalog.category.updated', entityType: 'Category', entityId: id, requestId: getRequestId(), after: { name: category.name, slug: category.slug } });
    return { data: { category: this.categoryNode(category) } };
  }

  async listCategories(): Promise<CategoryListResponse> {
    const categories = await this.prisma.category.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { products: true } } } });
    return { data: { items: categories.map(category => ({ id: category.id, name: category.name, slug: category.slug, parentId: category.parentId, productCount: category._count.products })) } };
  }

  async categoryTree(): Promise<CategoryTreeResponse> {
    const rows = await this.prisma.category.findMany({ orderBy: { name: 'asc' }, include: { children: true } });
    const nodes = new Map<string, CategoryTreeNode>(rows.map(row => [row.id, { id: row.id, name: row.name, slug: row.slug, parentId: row.parentId, children: [], createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() }]));
    for (const node of nodes.values()) if (node.parentId && nodes.has(node.parentId)) nodes.get(node.parentId)!.children.push(node);
    return { data: { tree: [...nodes.values()].filter(node => node.parentId === null) } };
  }

  private productInclude() { return { brand: { include: { _count: { select: { products: true } } } }, category: { include: { _count: { select: { products: true } } } }, variants: true } as const; }
  private categoryInclude() { return { children: true } as const; }
  private productListItem(row: { id: string; name: string; slug: string; status: ProductStatus; brandId: string | null; categoryId: string | null; createdAt: Date; updatedAt: Date }) { return { id: row.id, name: row.name, slug: row.slug, status: statusToApi(row.status), brandId: row.brandId, categoryId: row.categoryId, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() }; }
  private categoryNode(row: CategoryInput): CategoryTreeNode { return { id: row.id, name: row.name, slug: row.slug, parentId: row.parentId, children: (row.children ?? []).map(child => this.categoryNode(child)), createdAt: new Date(row.createdAt).toISOString(), updatedAt: new Date(row.updatedAt).toISOString() }; }
  private productDetail(row: ProductDetailRow) { return { ...this.productListItem(row), description: row.description, brand: row.brand ? { id: row.brand.id, name: row.brand.name, slug: row.brand.slug, productCount: row.brand._count.products } : null, category: row.category ? { id: row.category.id, name: row.category.name, slug: row.category.slug, parentId: row.category.parentId, productCount: row.category._count.products } : null, variants: row.variants.map(variant => this.productVariantPrivateDetail(variant)) }; }
  private productDetailPublic(row: ProductDetailRow) { return { ...this.productListItem(row), description: row.description, brand: row.brand ? { id: row.brand.id, name: row.brand.name, slug: row.brand.slug, productCount: row.brand._count.products } : null, category: row.category ? { id: row.category.id, name: row.category.name, slug: row.category.slug, parentId: row.category.parentId, productCount: row.category._count.products } : null, variants: row.variants.map(variant => this.productVariantBase(variant)) }; }
  private productVariantBase(variant: VariantRow) { return { id: variant.id, sku: variant.sku, barcode: variant.barcode ?? undefined, title: variant.title ?? undefined, salePrice: { amount: variant.salePrice.toString(), currency: 'IRR' as const }, weightGrams: variant.weightGrams ?? undefined, isActive: variant.isActive, createdAt: variant.createdAt.toISOString(), updatedAt: variant.updatedAt.toISOString() }; }
  private productVariantPrivateDetail(variant: VariantRow) { return { ...this.productVariantBase(variant), costPrice: { amount: variant.costPrice.toString(), currency: 'IRR' as const } }; }
  private async mapPrismaError<T>(operation: Promise<T>, resource: 'Brand' | 'Category' | 'Product'): Promise<T> {
    try {
      return await operation;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const fields = Array.isArray(error.meta?.target) ? (error.meta.target as string[]).join(', ') : 'unique value';
        throw new ConflictException({ code: 'CONFLICT', message: `A ${resource.toLowerCase()} with that ${fields} already exists.` });
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException({ code: 'NOT_FOUND', message: `${resource} not found.` });
      }
      throw error;
    }
  }
}
