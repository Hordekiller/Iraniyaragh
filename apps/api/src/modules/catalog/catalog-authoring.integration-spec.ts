import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../database/prisma.service';
import { assertIsolatedTestDatabase } from '../../test/database-url.guard';
import { AuditLogService } from '../audit/audit-log.service';
import { CatalogIdempotencyService } from './catalog-idempotency.service';
import { CatalogService } from './catalog.service';

// Actual PostgreSQL transactions, unique constraints and row/advisory locks.
describe.sequential('Catalog authoring: persisted attributes and category hierarchy', () => {
  const run = randomUUID().replaceAll('-', '').slice(0, 16);
  const prefix = `author-${run}`;
  const prisma = new PrismaService();
  const catalog = new CatalogService(prisma, new AuditLogService(prisma), new CatalogIdempotencyService(prisma));
  const key = (name: string) => `${prefix}-${name}`;
  let actor = '';
  let product = '';
  let firstVariant = '';
  let secondVariant = '';
  let color = '';
  let material = '';
  let root = '';
  let child = '';
  let connected = false;

  beforeAll(async () => {
    assertIsolatedTestDatabase({ databaseUrl: process.env.DATABASE_URL, nodeEnvironment: process.env.NODE_ENV });
    await prisma.$connect();
    connected = true;
    actor = (await prisma.user.create({ data: { email: `${prefix}@authoring.test`, isEmailVerified: true, emailVerifiedAt: new Date(), status: 'ACTIVE', createdAt: new Date(Date.now() - 60_000) } })).id;
    root = (await catalog.createCategory(actor, key('root'), { name: 'Parent', slug: `${prefix}-root` })).data.category.id;
    child = (await catalog.createCategory(actor, key('child'), { name: 'Child', slug: `${prefix}-child`, parentId: root })).data.category.id;
    color = (await catalog.createAttribute(actor, key('color'), { code: `${prefix}-color`, name: 'Color', options: [{ code: 'red', label: 'Red' }, { code: 'blue', label: 'Blue' }, { code: 'old', label: 'Inactive', status: 'INACTIVE' }] })).data.attribute.id;
    material = (await catalog.createAttribute(actor, key('material'), { code: `${prefix}-material`, name: 'Material', options: [{ code: 'steel', label: 'Steel' }] })).data.attribute.id;
    const created = await catalog.createProduct(actor, key('product'), {
      name: 'Authoring Product', slug: `${prefix}-product`, categoryId: child,
      variants: ['ONE', 'TWO'].map(suffix => ({ sku: `${prefix}-${suffix}`, costPrice: { amount: '100000', currency: 'IRR' as const }, salePrice: { amount: '125000', currency: 'IRR' as const } })),
    });
    product = created.data.product.id;
    [firstVariant, secondVariant] = created.data.product.variants.map(variant => variant.id);
    await catalog.configureProductAttributes(actor, product, { expectedVersion: created.data.product.version!, configurations: [
      { attributeCode: `${prefix}-color`, isVariantAxis: true, isRequired: true },
      { attributeCode: `${prefix}-material`, isVariantAxis: false },
    ] });
  });

  afterAll(async () => {
    if (!connected) return;
    await prisma.productMedia.deleteMany({ where: { productId: product } });
    await prisma.productVariant.deleteMany({ where: { productId: product } });
    await prisma.product.deleteMany({ where: { id: product } });
    await prisma.attributeOption.deleteMany({ where: { attributeId: { in: [color, material] } } });
    await prisma.attributeDefinition.deleteMany({ where: { id: { in: [color, material] } } });
    await prisma.category.deleteMany({ where: { slug: { startsWith: prefix } } });
    await prisma.catalogIdempotencyRecord.deleteMany({ where: { actorId: actor } });
    await prisma.user.deleteMany({ where: { id: actor } });
    await prisma.$disconnect();
  });

  const currentVersion = async (id = firstVariant) => (await prisma.productVariant.findUniqueOrThrow({ where: { id } })).version;
  const values = (option = 'red') => [{ attributeCode: `${prefix}-color`, optionCode: option }, { attributeCode: `${prefix}-material`, optionCode: 'steel' }];

  it('rejects missing required values, unconfigured attributes, wrong and inactive options without writes', async () => {
    const invalid = [[], [{ attributeCode: 'not-configured', optionCode: 'red' }], values('steel'), values('old'), [...values(), values()[0]!]];
    const version = await currentVersion();
    for (const [index, input] of invalid.entries()) {
      await expect(catalog.updateVariantAttributes(actor, key(`invalid-${index}`), firstVariant, { expectedVersion: version, values: input })).rejects.toMatchObject({ response: { code: 'ATTRIBUTE_OPTION_INVALID' } });
    }
    expect(await currentVersion()).toBe(version);
    expect(await prisma.productVariantAttributeValue.count({ where: { variantId: firstVariant } })).toBe(0);
  });

  it('persists values, correct axis flags, integer IRR and one audit effect across replay', async () => {
    const input = { expectedVersion: await currentVersion(), values: values() };
    const first = await catalog.updateVariantAttributes(actor, key('values'), firstVariant, input);
    expect(await catalog.updateVariantAttributes(actor, key('values'), firstVariant, input)).toEqual(first);
    expect(first.data.variant.attributeValues).toEqual(expect.arrayContaining([
      expect.objectContaining({ attributeCode: `${prefix}-color`, optionCode: 'red', isVariantAxis: true }),
      expect.objectContaining({ attributeCode: `${prefix}-material`, optionCode: 'steel', isVariantAxis: false }),
    ]));
    expect(first.data.variant.salePrice).toEqual({ amount: '125000', currency: 'IRR' });
    expect(await prisma.auditLog.count({ where: { entityId: firstVariant, action: 'catalog.variant.attributes_updated' } })).toBe(1);
    const reloaded = await catalog.getAdminProduct(product);
    expect(reloaded.data.product.variants.find(variant => variant.id === firstVariant)?.attributeValues).toEqual(first.data.variant.attributeValues);
  });

  it('rejects stale writes and conflicting idempotency payloads', async () => {
    await expect(catalog.updateVariantAttributes(actor, key('stale'), firstVariant, { expectedVersion: 0, values: values('blue') })).rejects.toMatchObject({ response: { code: 'STALE_VERSION' } });
    await expect(catalog.updateVariantAttributes(actor, key('values'), firstVariant, { expectedVersion: await currentVersion(), values: values('blue') })).rejects.toMatchObject({ response: { code: 'IDEMPOTENCY_CONFLICT' } });
  });

  it('rejects duplicate combinations and rolls back the replacement and version', async () => {
    const version = await currentVersion(secondVariant);
    await expect(catalog.updateVariantAttributes(actor, key('duplicate'), secondVariant, { expectedVersion: version, values: values() })).rejects.toMatchObject({ response: { code: 'DUPLICATE_VARIANT_COMBINATION' } });
    expect(await currentVersion(secondVariant)).toBe(version);
    expect(await prisma.productVariantAttributeValue.count({ where: { variantId: secondVariant } })).toBe(0);
  });

  it('blocks publish until every active SKU has required attributes', async () => {
    await expect(catalog.changeProductStatus(actor, key('incomplete'), product, { action: 'publish' })).rejects.toMatchObject({ response: { code: 'ATTRIBUTE_OPTION_INVALID' } });
    expect((await catalog.getAdminProduct(product)).data.product.status).toBe('DRAFT');
  });

  it('serializes concurrent edits, with one version winner and no mixed values', async () => {
    const version = await currentVersion(secondVariant);
    const results = await Promise.allSettled(['a', 'b'].map(suffix => catalog.updateVariantAttributes(actor, key(`race-${suffix}`), secondVariant, { expectedVersion: version, values: values('blue') })));
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find(result => result.status === 'rejected')).toMatchObject({ reason: { response: { code: 'STALE_VERSION' } } });
    expect(await prisma.productVariantAttributeValue.count({ where: { variantId: secondVariant } })).toBe(2);
  });

  it('blocks switching a populated characteristic into an axis and removing a populated axis', async () => {
    const current = (await catalog.getAdminProduct(product)).data.product;
    await expect(catalog.configureProductAttributes(actor, product, { expectedVersion: current.version!, configurations: [{ attributeCode: `${prefix}-color`, isVariantAxis: true }, { attributeCode: `${prefix}-material`, isVariantAxis: true }] })).rejects.toMatchObject({ response: { code: 'AXIS_IN_USE' } });
    await expect(catalog.configureProductAttributes(actor, product, { expectedVersion: current.version!, configurations: [] })).rejects.toMatchObject({ response: { code: 'AXIS_IN_USE' } });
    expect((await catalog.getAdminProduct(product)).data.product.attributes).toEqual(current.attributes);
  });

  it('publishes only with ready primary media and exposes configured values without private costs', async () => {
    await expect(catalog.changeProductStatus(actor, key('no-image'), product, { action: 'publish' })).rejects.toMatchObject({ response: { code: 'MEDIA_PRIMARY_REQUIRED' } });
    // This database test isolates lifecycle/projection; the browser journey processes actual uploaded bytes.
    await prisma.productMedia.create({ data: { productId: product, kind: 'IMAGE', state: 'READY', role: 'PRIMARY', position: 0, objectKey: `${prefix}/primary.webp`, originalFilename: 'test.webp', declaredMime: 'image/webp', declaredBytes: 100n, detectedMime: 'image/webp', bytes: 100n, checksumSha256: 'ab'.repeat(32), width: 100, height: 100, altText: 'Primary', createdById: actor, uploadExpiresAt: new Date(Date.now() + 60000) } });
    await catalog.changeProductStatus(actor, key('publish'), product, { action: 'publish' });
    const publicProduct = (await catalog.getPublicProduct(`${prefix}-product`)).data.product;
    expect(publicProduct.status).toBe('PUBLISHED');
    expect(publicProduct.variants).toHaveLength(2);
    for (const variant of publicProduct.variants) {
      expect(variant.attributeValues).toHaveLength(2);
      expect(variant).not.toHaveProperty('costPrice');
      expect(variant).not.toHaveProperty('barcode');
      expect(variant).not.toHaveProperty('version');
    }
  });

  it('includes descendants in storefront category filters while admin filters remain exact', async () => {
    const storefront = await catalog.listPublicProducts({ categoryId: root });
    expect(storefront.data.items.map(item => item.id)).toContain(product);
    expect((await catalog.listCategories()).data.items.find(item => item.id === root)?.productCount).toBe(1);
    const admin = await catalog.listAdminProducts({ categoryId: root });
    expect(admin.data.items.map(item => item.id)).not.toContain(product);
    expect((await catalog.categoryTree()).data.tree.find(node => node.id === root)?.children.map(node => node.id)).toContain(child);
  });

  it('cannot generate an incomplete active SKU under a published product', async () => {
    const current = (await catalog.getAdminProduct(product)).data.product;
    await catalog.configureProductAttributes(actor, product, { expectedVersion: current.version!, configurations: [
      { attributeCode: `${prefix}-color`, isVariantAxis: true, isRequired: true },
      { attributeCode: `${prefix}-material`, isVariantAxis: false, isRequired: true },
    ] });
    const count = await prisma.productVariant.count({ where: { productId: product } });
    await expect(catalog.generateVariants(actor, key('incomplete-generate'), product, { optionSelection: { [`${prefix}-color`]: ['red'] }, costPrice: { amount: '100000', currency: 'IRR' }, salePrice: { amount: '125000', currency: 'IRR' } })).rejects.toMatchObject({ response: { code: 'ATTRIBUTE_OPTION_INVALID' } });
    expect(await prisma.productVariant.count({ where: { productId: product } })).toBe(count);
  });

  it('cannot activate an incomplete SKU under a published product', async () => {
    const inactive = await prisma.productVariant.create({ data: { productId: product, sku: `${prefix}-INCOMPLETE`, skuKey: `${prefix}-INCOMPLETE`, combinationSignature: `${prefix}-pending-inactive`, costPrice: 100000n, salePrice: 125000n, status: 'INACTIVE', isActive: false } });
    await expect(catalog.updateVariantStatus(actor, key('incomplete-activate'), inactive.id, { expectedVersion: inactive.version, status: 'ACTIVE' })).rejects.toMatchObject({ response: { code: 'ATTRIBUTE_OPTION_INVALID' } });
    expect(await prisma.productVariant.findUniqueOrThrow({ where: { id: inactive.id } })).toMatchObject({ version: inactive.version, status: 'INACTIVE', isActive: false });
  });

  it('serializes concurrent reparenting and prevents cycles', async () => {
    const a = (await catalog.createCategory(actor, key('cycle-a'), { name: 'A', slug: `${prefix}-cycle-a` })).data.category.id;
    const b = (await catalog.createCategory(actor, key('cycle-b'), { name: 'B', slug: `${prefix}-cycle-b` })).data.category.id;
    const results = await Promise.allSettled([catalog.updateCategory(actor, a, { parentId: b }), catalog.updateCategory(actor, b, { parentId: a })]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find(result => result.status === 'rejected')).toMatchObject({ reason: { response: { code: 'CONFLICT' } } });
  });
});
