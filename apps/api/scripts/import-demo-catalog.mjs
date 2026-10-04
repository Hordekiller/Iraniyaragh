// Authenticated SSH/operator maintenance command, never an HTTP auth/fixture path.
// Runs shipped application services against isolated shared staging only.
import 'reflect-metadata';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { assertCatalogDemoEnvironment, assertCatalogDemoUrl, validateCatalogDemoManifest } from './demo-catalog/policy.mjs';

const require = createRequire(import.meta.url);
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/src/app.module.js');
const { PrismaService } = require('../dist/src/database/prisma.service.js');
const { CatalogService } = require('../dist/src/modules/catalog/catalog.service.js');
const { MediaService } = require('../dist/src/modules/media/media.service.js');
const { InventoryService } = require('../dist/src/modules/inventory/inventory.service.js');
const { AuthPermissionService } = require('../dist/src/modules/auth/auth-permission.service.js');
const { runWithRequestContext } = require('../dist/src/common/request-context.js');
class CatalogDemoError extends Error {}
const namespace = 'staging-demo-v1';
const key = (...parts) => `${namespace}-${parts.join('-')}`;
const modes = new Set(['--confirm', '--verify']);
const mode = process.argv[2];
const operatorIndex = process.argv.indexOf('--operator-id');
const actorId = operatorIndex > 0 ? process.argv[operatorIndex + 1] : null;
let app;

try {
  assertCatalogDemoEnvironment(process.env);
  if (!modes.has(mode) || !actorId) throw new CatalogDemoError('Usage: node scripts/import-demo-catalog.mjs --confirm|--verify --operator-id ID. A restored/verified backup is required before --confirm.');
  const manifest = JSON.parse(await readFile(new URL('./demo-catalog/manifest.json', import.meta.url), 'utf8'));
  validateCatalogDemoManifest(manifest);
  app = await NestFactory.createApplicationContext(AppModule, { logger: false, abortOnError: false });
  const prisma = app.get(PrismaService);
  const catalog = guarded(app.get(CatalogService), ['createBrand', 'createCategory', 'createAttribute', 'createProduct', 'configureProductAttributes', 'updateVariantAttributes', 'updateVariantPrice', 'updateProductDescription', 'changeProductStatus']);
  const media = guarded(app.get(MediaService), ['initiateUpload', 'confirmUpload', 'archive', 'updateMetadata']);
  const inventory = guarded(app.get(InventoryService), ['createWarehouse', 'createLocation', 'changeOnHand']);
  const permissions = app.get(AuthPermissionService);
  const requiredPermissions = ['catalog.write', 'catalog.media.write', 'inventory.adjust'];
  async function authorize() {
    const actor = await prisma.user.findFirst({ where: { id: actorId, status: 'ACTIVE', deletedAt: null }, select: { id: true } });
    const allowed = actor ? await permissions.effectivePermissionKeys(actorId) : new Set();
    if (!actor || requiredPermissions.some(permission => !allowed.has(permission))) throw new CatalogDemoError('The maintenance operator must be active and currently have catalog/media/inventory permissions.');
  }
  async function isolated() {
    assertCatalogDemoEnvironment(process.env);
    const counts = await Promise.all([prisma.order.count(), prisma.payment.count(), prisma.customer.count(), prisma.inventoryMovement.count({ where: { OR: [{ referenceType: null }, { referenceType: { not: namespace } }] } })]);
    if (counts.some(count => count !== 0)) throw new CatalogDemoError('Refusing demo import: this database has customers, orders, payments or non-demo inventory history.');
  }
  function guarded(service, commands) {
    return new Proxy(service, { get(target, property) {
      const value = Reflect.get(target, property);
      if (typeof value !== 'function') return value;
      if (!commands.includes(property)) return value.bind(target);
      return async (...args) => { await authorize(); await isolated(); return value.apply(target, args); };
    } });
  }
  await authorize();
  await isolated();
  const context = { actorId, requestId: namespace };
  const codes = ['demo-v1-package', 'demo-v1-condition'];
  const configuration = [{ attributeCode: codes[0], isVariantAxis: true, isRequired: true }, { attributeCode: codes[1], isVariantAxis: false, isRequired: false }];
  const categoryNames = { power: 'ابزار برقی', hand: 'ابزار دستی', pneumatic: 'ابزار بادی', safety: 'ایمنی و کار', measuring: 'اندازه‌گیری', garden: 'باغبانی' };

  async function ownedCategory(slug, name, parentId) {
    let row = await prisma.category.findUnique({ where: { slug } });
    if (!row) row = (await catalog.createCategory(actorId, key(slug), { slug, name, ...(parentId ? { parentId } : {}) })).data.category;
    if (row.name !== name || (row.parentId ?? null) !== (parentId ?? null)) throw new CatalogDemoError('Existing demo category differs; refusing overwrite.');
    return row;
  }
  async function readyImage(productId, item, position) {
    const filename = `demo-v1-${item.sourceId}-${position}.jpg`;
    const bytes = await readFile(new URL(`./demo-catalog/${position === 0 ? item.image : 'tool3.jpg'}`, import.meta.url));
    let existing = await prisma.productMedia.findFirst({ where: { productId, position, state: { not: 'ARCHIVED' } } });
    if (existing && (existing.originalFilename !== filename || existing.createdById !== actorId || existing.kind !== 'IMAGE')) throw new CatalogDemoError('Media position belongs to another author; refusing overwrite.');
    if (existing?.state === 'FAILED') throw new CatalogDemoError(`Demo media processing failed: ${/^[A-Z0-9_]{1,80}$/u.test(existing.failureCode ?? '') ? existing.failureCode : 'UNKNOWN'}. Repair the underlying scanner/storage failure before retrying.`);
    if (existing?.state === 'PENDING_UPLOAD' && existing.uploadExpiresAt.getTime() <= Date.now()) {
      await media.archive(actorId, key('expired', existing.id), productId, existing.id, { expectedVersion: existing.version });
      existing = null;
    }
    if (!existing || existing.state === 'PENDING_UPLOAD') {
      const product = (await catalog.getAdminProduct(productId)).data.product;
      const attempt = await prisma.productMedia.count({ where: { productId, originalFilename: filename, state: 'ARCHIVED' } });
      const intent = await media.initiateUpload(actorId, key(item.sourceId, 'image', position, attempt), productId, { kind: 'IMAGE', role: position === 0 ? 'PRIMARY' : 'GALLERY', position, originalFilename: filename, declaredMime: 'image/jpeg', bytes: bytes.length, productVersion: product.version });
      const upload = intent.data.upload;
      // Use the exact signed HTTPS URL/headers; never copy bytes into a running service.
      const uploadUrl = assertCatalogDemoUrl(upload.uploadUrl, process.env.OBJECT_STORAGE_UPLOAD_ENDPOINT, { signedUpload: true });
      const response = await fetch(uploadUrl, { method: upload.method, headers: upload.requiredHeaders, body: bytes, redirect: 'error', signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new CatalogDemoError(`Demo image upload failed with HTTP ${response.status}.`);
      await media.confirmUpload(actorId, key('confirm', upload.mediaId), productId, upload.mediaId, { checksumSha256: createHash('sha256').update(bytes).digest('hex') });
      existing = await prisma.productMedia.findUniqueOrThrow({ where: { id: upload.mediaId } });
    } else if (existing.state === 'UPLOADED' || existing.state === 'PROCESSING') {
      await media.confirmUpload(actorId, key('confirm', existing.id), productId, existing.id, { checksumSha256: createHash('sha256').update(bytes).digest('hex') });
    }
    const deadline = Date.now() + 120000;
    while (existing.state !== 'READY') {
      if (existing.state === 'FAILED' || existing.state === 'ARCHIVED' || Date.now() >= deadline) throw new CatalogDemoError(`Demo image is not ready (${existing.state}); publication aborted.`);
      await delay(1000); // Bounded status polling of the real worker, not a simulated success.
      existing = await prisma.productMedia.findUniqueOrThrow({ where: { id: existing.id } });
    }
    const altText = `${item.name} — تصویر نمایشی دمو ${position + 1}`;
    const caption = 'تصویر نمونه برای نمایش امکانات؛ عکس و مشخصات فروش واقعی نیست.';
    if (existing.altText !== altText || existing.caption !== caption) await media.updateMetadata(actorId, key('metadata', existing.id), productId, existing.id, { expectedVersion: existing.version, altText, caption });
    return existing.id;
  }

  await runWithRequestContext({ requestId: namespace, correlationId: namespace, startedAt: new Date().toISOString() }, async () => {
    if (mode === '--confirm') {
      for (const [index, code] of codes.entries()) {
        const existing = await prisma.attributeDefinition.findUnique({ where: { code }, include: { options: true } });
        if (!existing) await catalog.createAttribute(actorId, key(code), { code, name: index === 0 ? '[دمو] بستهٔ نمونه' : '[دمو] کاربرد نمونه', options: index === 0 ? [{ code: 'standard', label: 'استاندارد (دمو)' }, { code: 'plus', label: 'پلاس (دمو)' }] : [{ code: 'display', label: 'نمایش امکانات؛ فروش واقعی نیست' }] });
        else if (existing.status !== 'ACTIVE' || (index === 0 ? ['standard', 'plus'] : ['display']).some(option => !existing.options.some(value => value.code === option && value.status === 'ACTIVE'))) throw new CatalogDemoError('Demo attribute definition differs; refusing overwrite.');
      }
      const root = await ownedCategory('demo-v1-catalog', '[دمو] کاتالوگ نمونه');
      const categories = new Map();
      for (const [category, name] of Object.entries(categoryNames)) categories.set(category, await ownedCategory(`demo-v1-${category}`, `[دمو] ${name}`, root.id));
      let warehouse = await prisma.warehouse.findUnique({ where: { code: 'WH-DEMO-V1' } });
      if (!warehouse) warehouse = await inventory.createWarehouse({ ...context, code: 'WH-DEMO-V1', name: '[دمو] انبار نمونه؛ فروش واقعی نیست' });
      if (!warehouse.isActive || !warehouse.name.startsWith('[دمو]')) throw new CatalogDemoError('Demo warehouse differs; refusing overwrite.');
      let location = await prisma.warehouseLocation.findUnique({ where: { warehouseId_code: { warehouseId: warehouse.id, code: 'DEMO-V1' } } });
      if (!location) location = await inventory.createLocation(warehouse.id, { ...context, code: 'DEMO-V1', name: '[دمو] قفسهٔ نمونه' });
      if (!location.isActive || !location.name?.startsWith('[دمو]')) throw new CatalogDemoError('Demo location differs; refusing overwrite.');
      for (const item of manifest.products) {
        await authorize(); await isolated();
        console.log(`Preparing labelled demo ${item.sourceId}.`);
        const brandSlug = `demo-v1-${item.brand.toLowerCase().replaceAll(' ', '-')}`;
        let brand = await prisma.brand.findUnique({ where: { slug: brandSlug } });
        if (!brand) brand = (await catalog.createBrand(actorId, key(brandSlug), { name: `[دمو] ${item.brand}`, slug: brandSlug })).data.brand;
        if (brand.name !== `[دمو] ${item.brand}`) throw new CatalogDemoError('Demo brand differs; refusing overwrite.');
        let product = await prisma.product.findUnique({ where: { slug: item.slug } });
        if (!product) product = (await catalog.createProduct(actorId, key(item.sourceId, 'create'), { name: item.name, slug: item.slug, brandId: brand.id, categoryId: categories.get(item.category).id, description: '<p>محصول نمایشی دمو؛ قیمت، مشخصات و موجودی نمونه هستند و برای فروش واقعی نیستند.</p>', variants: ['standard', 'plus'].map((option, index) => ({ sku: `DEMO-V1-${item.sourceId.toUpperCase()}-${option.toUpperCase()}`, barcode: `DEMO-V1-${item.sourceId}-${index}`, title: `[دمو] ${option}`, weightGrams: 1000 + index * 200, costPrice: { amount: item.costPriceIRR, currency: 'IRR' }, salePrice: { amount: item.salePriceIRR, currency: 'IRR' } })) })).data.product;
        if (product.name !== item.name || product.brandId !== brand.id || product.categoryId !== categories.get(item.category).id || (product.status !== 'DRAFT' && product.status !== 'ACTIVE')) throw new CatalogDemoError('Existing demo product differs; refusing overwrite.');
        let detail = (await catalog.getAdminProduct(product.id)).data.product;
        if (!detail.attributes?.length) await catalog.configureProductAttributes(actorId, product.id, { expectedVersion: detail.version, configurations: configuration });
        else if (JSON.stringify(detail.attributes.map(value => ({ attributeCode: value.attributeCode, isVariantAxis: value.isVariantAxis, isRequired: value.isRequired })).sort((a,b) => a.attributeCode.localeCompare(b.attributeCode))) !== JSON.stringify([...configuration].sort((a,b) => a.attributeCode.localeCompare(b.attributeCode)))) throw new CatalogDemoError('Existing product attributes differ; refusing overwrite.');
        detail = (await catalog.getAdminProduct(product.id)).data.product;
        if (detail.variants.length !== 2) throw new CatalogDemoError('Existing demo variant count differs; refusing overwrite.');
        for (const option of ['standard', 'plus']) {
          let variant = detail.variants.find(value => value.sku === `DEMO-V1-${item.sourceId.toUpperCase()}-${option.toUpperCase()}`);
          if (!variant || variant.status !== 'ACTIVE' || variant.salePrice.amount !== item.salePriceIRR || variant.costPrice.amount !== item.costPriceIRR) throw new CatalogDemoError('Existing demo variant differs; refusing overwrite.');
          if (!variant.attributeValues?.length) variant = (await catalog.updateVariantAttributes(actorId, key(item.sourceId, option, 'values'), variant.id, { expectedVersion: variant.version, values: [{ attributeCode: codes[0], optionCode: option }, { attributeCode: codes[1], optionCode: 'display' }] })).data.variant;
          else if (variant.attributeValues.length !== 2 || !variant.attributeValues.some(value => value.attributeCode === codes[0] && value.optionCode === option) || !variant.attributeValues.some(value => value.attributeCode === codes[1] && value.optionCode === 'display')) throw new CatalogDemoError('Existing variant attribute values differ; refusing overwrite.');
          if (!await prisma.variantPriceRecord.count({ where: { variantId: variant.id } })) await catalog.updateVariantPrice(actorId, variant.id, { expectedVersion: variant.version, costPrice: variant.costPrice, salePrice: variant.salePrice, reason: '[دمو] قیمت اولیهٔ نمونه؛ فروش واقعی نیست' });
          await inventory.changeOnHand({ ...context, warehouseId: warehouse.id, locationId: location.id, variantId: variant.id, delta: 10, type: 'ADJUSTMENT_IN', reason: '[دمو] موجودی اولیهٔ نمونه؛ فروش واقعی نیست', referenceType: namespace, referenceId: variant.id, idempotencyKey: key('stock', variant.id) });
        }
        const primary = await readyImage(product.id, item, 0);
        const gallery = await readyImage(product.id, item, 1);
        detail = (await catalog.getAdminProduct(product.id)).data.product;
        // Only media belonging to this product are referenced. The server sanitizer owns stored HTML.
        if (!detail.description?.includes(`data-media-id="${primary}"`)) await catalog.updateProductDescription(actorId, key(item.sourceId, 'description'), product.id, { expectedVersion: detail.version, description: `<h2>${item.name}</h2><p><strong>دمو — فروش واقعی نیست.</strong> قیمت، وزن، موجودی و تصاویر نمونه هستند.</p><p>${item.description}</p><table><tr><th>بستهٔ نمونه</th><th>کاربرد</th></tr><tr><td>استاندارد / پلاس</td><td>نمایش امکانات پنل و فروشگاه</td></tr></table><p><img data-media-id="${primary}"></p><p><img data-media-id="${gallery}"></p>` });
        if (detail.status !== 'PUBLISHED') await catalog.changeProductStatus(actorId, key(item.sourceId, 'publish'), product.id, { action: 'publish' });
        console.log(`Imported ${item.sourceId}: draft → attributes/SKUs/IRR → real images → sanitized description → publish.`);
      }
    }
    for (const item of manifest.products) {
      const product = (await catalog.getPublicProduct(item.slug)).data.product;
      if (product.name !== item.name || product.status !== 'PUBLISHED' || product.variants.length !== 2 || product.media.length !== 2 || !product.description?.includes('دمو')) throw new CatalogDemoError('Demo public acceptance failed.');
      for (const variant of product.variants) if (variant.salePrice.amount !== item.salePriceIRR || variant.attributeValues?.length !== 2 || 'costPrice' in variant || 'barcode' in variant) throw new CatalogDemoError('Demo variant public acceptance failed.');
      for (const asset of product.media) {
        if (asset.kind !== 'IMAGE' || !asset.alt.includes('دمو') || !asset.sources.length) throw new CatalogDemoError('Demo media public acceptance failed.');
        const publicUrl = assertCatalogDemoUrl(asset.sources[0].url, process.env.PUBLIC_MEDIA_ORIGIN);
        const response = await fetch(publicUrl, { redirect: 'error', signal: AbortSignal.timeout(15000) });
        if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) throw new CatalogDemoError('Demo public image path failed.');
      }
    }
    const count = await prisma.product.count({ where: { slug: { in: manifest.products.map(item => item.slug) }, status: 'ACTIVE' } });
    if (count !== 15) throw new CatalogDemoError('Unexpected published demo count.');
    const [prices, balances, movements] = await Promise.all([prisma.variantPriceRecord.count({ where: { variant: { product: { slug: { in: manifest.products.map(item => item.slug) } } } } }), prisma.inventoryBalance.count({ where: { warehouse: { code: 'WH-DEMO-V1' }, onHand: 10, reserved: 0, available: 10 } }), prisma.inventoryMovement.count({ where: { referenceType: namespace } })]);
    if (prices !== 30 || balances !== 30 || movements !== 30) throw new CatalogDemoError('Demo price/stock acceptance failed.');
    console.log('PASS: 15 labelled demo products, 30 SKUs, 30 real processed images, safe descriptions and public attributes. No customer/order/payment/provider success created.');
  });
} catch (error) {
  // Never log signed URLs, object keys, credentials, Prisma parameters or unsafe request content.
  const code = error?.response?.code ?? error?.code;
  console.error(`Catalog demo stopped: ${error instanceof CatalogDemoError ? error.message : typeof code === 'string' && /^[A-Z0-9_]+$/u.test(code) ? code : 'OPERATION_FAILED'}. No success was assumed; inspect the last completed demo step.`);
  process.exitCode = 1;
} finally {
  await app?.close();
}
