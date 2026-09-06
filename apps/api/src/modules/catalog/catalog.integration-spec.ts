import { randomUUID } from 'node:crypto';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../database/prisma.service';
import { assertIsolatedTestDatabase } from '../../test/database-url.guard';
import { AuditLogService } from '../audit/audit-log.service';
import { CatalogService } from './catalog.service';

describe.sequential('CatalogService database integration', () => {
  const runId = randomUUID().replaceAll('-', '').slice(0, 20);
  const requestIdPrefix = `catinteg-${runId}`;
  const prisma = new PrismaService();
  const auditLog = new AuditLogService(prisma);
  const catalog = new CatalogService(prisma, auditLog);
  let connected = false;
  let actorId = '';
  let actorRoleId = '';
  let brandId = '';
  let categoryId = '';
  let childCategoryId = '';

  const brandName = `Integration Brand ${runId}`;
  const brandSlug = `integration-brand-${runId}`;
  const categoryName = `Integration Category ${runId}`;
  const categorySlug = `integration-category-${runId}`;
  const childSlug = `integration-child-${runId}`;
  const productSlug = `integration-product-${runId}`;

  beforeAll(async () => {
    assertIsolatedTestDatabase({
      databaseUrl: process.env.DATABASE_URL,
      nodeEnvironment: process.env.NODE_ENV,
    });

    await prisma.$connect();
    connected = true;

    const actor = await prisma.user.create({
      data: {
        mobile: `+989${runId.replace(/\D/g, '').padStart(9, '0').slice(0, 9)}`,
        status: 'ACTIVE',
        isMobileVerified: true,
        createdAt: new Date(Date.now() - 60_000),
        mobileVerifiedAt: new Date(),
      },
    });
    actorId = actor.id;

    const role = await prisma.role.create({
      data: { key: `cat-it-${runId}`, name: `Catalog integration ${runId}` },
    });
    actorRoleId = role.id;
    await prisma.userRole.create({
      data: { userId: actorId, roleId: role.id, assignedById: actorId },
    });

    const brand = await prisma.brand.create({
      data: { name: brandName, slug: brandSlug },
    });
    brandId = brand.id;

    const category = await prisma.category.create({
      data: { name: categoryName, slug: categorySlug },
    });
    categoryId = category.id;

    const child = await prisma.category.create({
      data: { name: `${categoryName} Child`, slug: childSlug, parentId: categoryId },
    });
    childCategoryId = child.id;
  });

  afterAll(async () => {
    if (!connected) return;

    await prisma.auditLog.deleteMany({
      where: { requestId: { startsWith: requestIdPrefix } },
    });
    await prisma.productVariant.deleteMany({
      where: { product: { slug: productSlug } },
    });
    await prisma.product.deleteMany({ where: { slug: productSlug } });
    await prisma.category.deleteMany({
      where: { id: { in: [childCategoryId, categoryId] } },
    });
    await prisma.brand.deleteMany({ where: { id: brandId } });
    await prisma.userRole.deleteMany({ where: { roleId: actorRoleId } });
    await prisma.role.deleteMany({ where: { id: actorRoleId } });
    await prisma.user.deleteMany({ where: { id: actorId } });
    await prisma.$disconnect();
  });

  it('builds a nested category tree that reflects parent-child relationships', async () => {
    const tree = await catalog.categoryTree();
    const root = tree.data.tree.find((c) => c.id === categoryId);
    expect(root).toBeDefined();
    expect(root!.children.map((c) => c.id)).toContain(childCategoryId);
    expect(root!.createdAt).toBeTruthy();
  });

  it('lists brand summaries with a product count', async () => {
    const list = await catalog.listBrands();
    expect(list.data.items.find((b) => b.id === brandId)).toMatchObject({
      name: brandName,
      slug: brandSlug,
      productCount: 0,
    });
  });

  it('creates a product with integer-rial money variants and persists BigInt prices', async () => {
    const created = await catalog.createProduct(actorId, {
      name: 'Integration Product',
      slug: productSlug,
      brandId,
      categoryId,
      variants: [
        {
          sku: `CAT-SKU-${runId}`,
          costPrice: { amount: '100000', currency: 'IRR' },
          salePrice: { amount: '125000', currency: 'IRR' },
          weightGrams: 250,
        },
      ],
    });

    const product = created.data.product;
    expect(product.brand).toMatchObject({ id: brandId });
    expect(product.category).toMatchObject({ id: categoryId });
    expect(product.status).toBe('DRAFT');
    expect(product.variants).toHaveLength(1);
    expect(product.variants[0]).toMatchObject({
      costPrice: { amount: '100000', currency: 'IRR' },
      salePrice: { amount: '125000', currency: 'IRR' },
      weightGrams: 250,
      isActive: true,
    });

    const persisted = await prisma.productVariant.findUniqueOrThrow({
      where: { sku: `CAT-SKU-${runId}` },
    });
    expect(persisted.costPrice).toBe(100000n);
    expect(persisted.salePrice).toBe(125000n);
  });

  it('does not expose a draft product through the public catalog', async () => {
    await expect(catalog.getPublicProduct(productSlug)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('publishes a product and surfaces it through the public catalog', async () => {
    const created = await catalog.createProduct(actorId, {
      name: 'Publishable Product',
      slug: `publishable-${runId}`,
      variants: [
        {
          sku: `PUB-SKU-${runId}`,
          costPrice: { amount: '50000', currency: 'IRR' },
          salePrice: { amount: '60000', currency: 'IRR' },
        },
      ],
    });
    const id = created.data.product.id;

    const published = await catalog.changeProductStatus(actorId, id, {
      action: 'publish',
    });
    expect(published.data.product.status).toBe('PUBLISHED');

    const viaSlug = await catalog.getPublicProduct(`publishable-${runId}`);
    expect(viaSlug.data.product.status).toBe('PUBLISHED');
    expect(viaSlug.data.product.variants).toHaveLength(1);

    await prisma.auditLog.deleteMany({
      where: { requestId: { startsWith: requestIdPrefix } },
    });
    await prisma.productVariant.deleteMany({
      where: { productId: id },
    });
    await prisma.product.delete({ where: { id } });
  });

  it('rejects publishing a product that has no SKU', async () => {
    const created = await catalog.createProduct(actorId, {
      name: 'No Variant Product',
      slug: `no-variant-${runId}`,
    });
    const id = created.data.product.id;

    await expect(
      catalog.changeProductStatus(actorId, id, { action: 'publish' }),
    ).rejects.toBeInstanceOf(ConflictException);

    await prisma.auditLog.deleteMany({
      where: { requestId: { startsWith: requestIdPrefix } },
    });
    await prisma.product.delete({ where: { id } });
  });

  it('lists products without sensitive pricing for non-staff queries', async () => {
    const list = await catalog.listPublicProducts({ status: 'PUBLISHED' });
    for (const item of list.data.items) {
      expect(item).not.toHaveProperty('variants');
      expect(item).not.toHaveProperty('description');
    }
  });

  it('updates a brand name and slug and records an audit event', async () => {
    const updated = await catalog.updateBrand(actorId, brandId, {
      name: `${brandName} Updated`,
      slug: `${brandSlug}-updated`,
    });
    expect(updated.data.brand.name).toBe(`${brandName} Updated`);

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'catalog.brand.updated', entityId: brandId },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit).toMatchObject({ actorId, entityType: 'Brand' });

    await prisma.brand.update({
      where: { id: brandId },
      data: { name: brandName, slug: brandSlug },
    });
    await prisma.auditLog.deleteMany({
      where: { requestId: { startsWith: requestIdPrefix } },
    });
  });

  it('writes an audit row when creating a category', async () => {
    const extraSlug = `extra-category-${runId}`;
    const created = await catalog.createCategory(actorId, {
      name: 'Extra Category',
      slug: extraSlug,
    });

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'catalog.category.created', entityId: created.data.category.id },
    });
    expect(audit).toMatchObject({ actorId, entityType: 'Category' });

    await prisma.auditLog.deleteMany({
      where: { requestId: { startsWith: requestIdPrefix } },
    });
    await prisma.category.delete({ where: { id: created.data.category.id } });
  });
});
