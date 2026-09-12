import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma, ProductStatus } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CatalogService } from './catalog.service';

const brandRow = { id: 'brand-1', name: 'Brand One', slug: 'brand-one', _count: { products: 2 } };
const categoryRow = { id: 'cat-1', name: 'Category One', slug: 'category-one', parentId: null, _count: { products: 3 }, createdAt: new Date('2026-01-01T00:00:00Z'), updatedAt: new Date('2026-01-02T00:00:00Z') };
const variant = {
  id: 'variant-1', sku: 'SKU-1', barcode: '123456', title: 'Variant Title', costPrice: 100000n, salePrice: 125000n, weightGrams: 250, status: 'ACTIVE', isActive: true, createdAt: new Date('2026-01-01T00:00:00Z'), updatedAt: new Date('2026-01-02T00:00:00Z'),
};
const productRow = {
  id: 'product-1', name: 'Product One', slug: 'product-one', description: 'A product', status: ProductStatus.ACTIVE,
  brandId: brandRow.id, categoryId: categoryRow.id, createdAt: new Date('2026-01-01T00:00:00Z'), updatedAt: new Date('2026-01-02T00:00:00Z'),
  brand: brandRow, category: categoryRow, variants: [variant],
};

function createFakeClient(overrides: Record<string, unknown> = {}) {
  return {
    product: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
    },
    brand: {
      create: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
    category: {
      create: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    auditLog: { create: vi.fn() },
    ...overrides,
  };
}

function buildService() {
  const client = createFakeClient();
  const tx = createFakeClient();
  const prisma = {
    product: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    brand: {
      create: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
    category: {
      create: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    $transaction: vi.fn().mockImplementation(async (fn: (c: unknown) => Promise<unknown>) => fn(tx as never)),
  } as never;
  const audit = { record: vi.fn() } as never;
  const idempotency = { run: vi.fn(async ({ execute }: { execute: (client: unknown) => Promise<{ response: unknown }> }) => (await execute(tx)).response) } as never;
  const service = new CatalogService(prisma, audit, idempotency);
  return { client, tx, audit, service, prisma: prisma as unknown as Record<string, unknown> };
}

function knownError(code: string, meta: Record<string, unknown> = { target: ['slug'] }) {
  return new Prisma.PrismaClientKnownRequestError('prisma error', { code, clientVersion: '6.19.3', meta });
}

describe('CatalogService', () => {
  let ctx: ReturnType<typeof buildService>;

  beforeEach(() => {
    ctx = buildService();
  });

  describe('public product detail', () => {
    it('returns a published product with public variant shape that omits costPrice but keeps salePrice', async () => {
      (ctx.prisma.product.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(productRow);
      const detail = await ctx.service.getPublicProduct('product-one');
      expect(ctx.prisma.product.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            brand: { include: { _count: { select: { products: { where: { status: ProductStatus.ACTIVE } } } } } },
            category: { include: { _count: { select: { products: { where: { status: ProductStatus.ACTIVE } } } } } },
            variants: { where: { isActive: true } },
          }),
        }),
      );
      expect(detail.data.product.status).toBe('PUBLISHED');
      expect(detail.data.product.variants[0]).toMatchObject({
        sku: 'SKU-1',
        salePrice: { amount: '125000', currency: 'IRR' },
      });
      expect(detail.data.product.variants[0]).not.toHaveProperty('costPrice');
      expect(detail.data.product.variants[0]).not.toHaveProperty('barcode');
    });

    it('throws NotFound for a missing or non-active product', async () => {
      (ctx.prisma.product.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      await expect(ctx.service.getPublicProduct('unknown')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('product list projections', () => {
    it('lists only active products for public queries and omits variants and description', async () => {
      (ctx.prisma.product.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([productRow]);
      (ctx.prisma.product.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);
      const list = await ctx.service.listPublicProducts({});
      expect(ctx.prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ status: { in: [ProductStatus.ACTIVE] } }) }),
      );
      expect(list.data.items[0]).not.toHaveProperty('variants');
      expect(list.data.items[0]).not.toHaveProperty('description');
    });

    it('maps admin DRAFT filter to both DRAFT and INACTIVE rows', async () => {
      (ctx.prisma.product.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      (ctx.prisma.product.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);
      await ctx.service.listAdminProducts({ status: 'DRAFT' });
      expect(ctx.prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ status: { in: [ProductStatus.DRAFT, ProductStatus.INACTIVE] } }) }),
      );
    });

    it('falls back safely for inherited-property sort values at the service boundary', async () => {
      (ctx.prisma.product.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      (ctx.prisma.product.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);
      await ctx.service.listAdminProducts({ sortBy: 'constructor' as never, sortDir: 'toString' as never });
      expect(ctx.prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { createdAt: 'desc' } }),
      );
    });
  });

  describe('product creation', () => {
    it('creates a product with nested variants inside a transaction and records audit', async () => {
      (ctx.tx.product.create as ReturnType<typeof vi.fn>).mockResolvedValue(productRow);
      const created = await ctx.service.createProduct('actor-1', 'unit-create-product', {
        name: 'Product One',
        slug: 'product-one',
        variants: [{ sku: 'SKU-1', costPrice: { amount: '100000', currency: 'IRR' }, salePrice: { amount: '125000', currency: 'IRR' } }],
      });
      expect(created.data.product.variants[0].costPrice).toEqual({ amount: '100000', currency: 'IRR' });
      expect(ctx.audit.record).toHaveBeenCalledTimes(1);
    });

    it('maps a duplicate slug or sku on create to Conflict (P2002)', async () => {
      (ctx.tx.product.create as ReturnType<typeof vi.fn>).mockRejectedValue(knownError('P2002', { target: ['slug'] }));
      await expect(
        ctx.service.createProduct('actor-1', 'unit-duplicate-product', { name: 'Product One', slug: 'product-one' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(ctx.tx.auditLog.create).not.toHaveBeenCalled();
    });

    it('rejects creating an already-published product without a SKU', async () => {
      await expect(
        ctx.service.createProduct('actor-1', 'unit-invalid-product', { name: 'Product One', slug: 'product-one', status: 'PUBLISHED' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(ctx.prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('product status transitions', () => {
    it('publishes a product with at least one SKU', async () => {
      (ctx.tx.product.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(productRow);
      (ctx.tx.product.update as ReturnType<typeof vi.fn>).mockResolvedValue({ ...productRow, status: ProductStatus.ACTIVE });
      const result = await ctx.service.changeProductStatus('actor-1', 'unit-publish-status', 'product-1', { action: 'publish' });
      expect(result.data.product.status).toBe('PUBLISHED');
    });

    it('maps INACTIVE to DRAFT for the api status model', async () => {
      (ctx.tx.product.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(productRow);
      (ctx.tx.product.update as ReturnType<typeof vi.fn>).mockResolvedValue({ ...productRow, status: ProductStatus.INACTIVE });
      const result = await ctx.service.changeProductStatus('actor-1', 'unit-unpublish-status', 'product-1', { action: 'unpublish' });
      expect(result.data.product.status).toBe('DRAFT');
    });

    it('rejects publishing a product without any active SKU', async () => {
      (ctx.tx.product.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ ...productRow, variants: [] });
      await expect(ctx.service.changeProductStatus('actor-1', 'unit-no-sku-status', 'product-1', { action: 'publish' })).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('throws NotFound for a missing product', async () => {
      (ctx.tx.product.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      await expect(ctx.service.changeProductStatus('actor-1', 'unit-missing-status', 'product-1', { action: 'unpublish' })).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('brand mutations', () => {
    it('creates a brand and records audit', async () => {
      (ctx.tx.brand.create as ReturnType<typeof vi.fn>).mockResolvedValue(brandRow);
      const result = await ctx.service.createBrand('actor-1', 'unit-create-brand', { name: 'Brand One', slug: 'brand-one' });
      expect(result.data.brand.productCount).toBe(2);
      expect(ctx.audit.record).toHaveBeenCalledWith(expect.any(Object), ctx.tx);
    });

    it('maps a duplicate brand slug to Conflict on create', async () => {
      (ctx.tx.brand.create as ReturnType<typeof vi.fn>).mockRejectedValue(knownError('P2002', { target: ['slug'] }));
      await expect(ctx.service.createBrand('actor-1', 'unit-duplicate-brand', { name: 'Brand One', slug: 'brand-one' })).rejects.toBeInstanceOf(ConflictException);
    });

    it('updates a brand and maps a missing id to NotFound (P2025)', async () => {
      (ctx.tx.brand.update as ReturnType<typeof vi.fn>).mockRejectedValue(knownError('P2025'));
      await expect(ctx.service.updateBrand('actor-1', 'missing', { name: 'Brand One' })).rejects.toBeInstanceOf(NotFoundException);
    });

    it('maps a duplicate brand slug to Conflict on update', async () => {
      (ctx.tx.brand.update as ReturnType<typeof vi.fn>).mockRejectedValue(knownError('P2002', { target: ['slug'] }));
      await expect(ctx.service.updateBrand('actor-1', 'brand-1', { slug: 'taken' })).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('category mutations', () => {
    it('creates a category and records audit', async () => {
      (ctx.tx.category.create as ReturnType<typeof vi.fn>).mockResolvedValue({ ...categoryRow, children: [] });
      const result = await ctx.service.createCategory('actor-1', 'unit-create-category', { name: 'Category One', slug: 'category-one' });
      expect(result.data.category.slug).toBe('category-one');
      expect(ctx.audit.record).toHaveBeenCalledWith(expect.any(Object), ctx.tx);
    });

    it('maps a duplicate category slug to Conflict on create', async () => {
      (ctx.tx.category.create as ReturnType<typeof vi.fn>).mockRejectedValue(knownError('P2002', { target: ['slug'] }));
      await expect(ctx.service.createCategory('actor-1', 'unit-duplicate-category', { name: 'Category One', slug: 'category-one' })).rejects.toBeInstanceOf(ConflictException);
    });

    it('updates a category and maps a missing id to NotFound (P2025)', async () => {
      (ctx.tx.category.update as ReturnType<typeof vi.fn>).mockRejectedValue(knownError('P2025'));
      await expect(ctx.service.updateCategory('actor-1', 'missing', { name: 'Category One' })).rejects.toBeInstanceOf(NotFoundException);
    });

    it('maps a duplicate category slug to Conflict on update', async () => {
      (ctx.tx.category.update as ReturnType<typeof vi.fn>).mockRejectedValue(knownError('P2002', { target: ['slug'] }));
      await expect(ctx.service.updateCategory('actor-1', 'cat-1', { slug: 'taken' })).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects moving a category under itself or one of its descendants', async () => {
      (ctx.tx.category.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ parentId: 'cat-1' });
      await expect(
        ctx.service.updateCategory('actor-1', 'cat-1', { parentId: 'child-1' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(ctx.tx.category.update).not.toHaveBeenCalled();
    });

    it('rejects a missing parent before updating the hierarchy', async () => {
      (ctx.tx.category.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
      await expect(
        ctx.service.updateCategory('actor-1', 'cat-1', { parentId: 'missing' }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(ctx.tx.category.update).not.toHaveBeenCalled();
    });

    it('maps an invalid parent reference to a stable unprocessable response', async () => {
      (ctx.tx.category.create as ReturnType<typeof vi.fn>).mockRejectedValue(knownError('P2003', { field_name: 'parentId' }));
      await expect(
        ctx.service.createCategory('actor-1', 'unit-invalid-parent', { name: 'Category One', slug: 'category-one', parentId: 'missing' }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });
  });

  describe('read queries', () => {
    it('lists brand summaries with product counts', async () => {
      (ctx.prisma.brand.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([brandRow]);
      const list = await ctx.service.listBrands();
      expect(ctx.prisma.brand.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ include: { _count: { select: { products: { where: { status: ProductStatus.ACTIVE } } } } } }),
      );
      expect(list.data.items[0]).toMatchObject({ id: 'brand-1', productCount: 2 });
    });

    it('lists category summaries with product counts', async () => {
      (ctx.prisma.category.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([categoryRow]);
      const list = await ctx.service.listCategories();
      expect(ctx.prisma.category.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ include: { _count: { select: { products: { where: { status: ProductStatus.ACTIVE } } } } } }),
      );
      expect(list.data.items[0]).toMatchObject({ id: 'cat-1', productCount: 3 });
    });

    it('builds a category tree rooted at top-level nodes', async () => {
      const parent = { id: 'parent', name: 'Parent', slug: 'parent', parentId: null, createdAt: new Date(), updatedAt: new Date(), children: [] };
      const child = { id: 'child', name: 'Child', slug: 'child', parentId: 'parent', createdAt: new Date(), updatedAt: new Date(), children: [] };
      (ctx.prisma.category.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([parent, child]);
      const tree = await ctx.service.categoryTree();
      expect(tree.data.tree).toHaveLength(1);
      expect(tree.data.tree[0].children.map(c => c.id)).toContain('child');
    });
  });
});
