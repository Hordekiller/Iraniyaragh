// Shared DEMO catalog fixtures.
//
// These rows are demo convenience data for a staging demo only. They are never
// part of the canonical baseline and are never created by the RBAC baseline
// path or by `auth:bootstrap`.
//
// This data deliberately stops at catalog, pricing, warehouse, location and
// opening inventory. It does not create orders, payments, payment confirmations
// or any SMS/notification delivery success, because a fabricated "payment
// succeeded" or "SMS sent" row would poison reconciliation and would let a
// reviewer mistake demo state for a real captured transaction.

import { assertCanonicalIntegrity } from "./rbac-baseline.mjs";

const DEMO_EMPTY_AXIS_SIGNATURE =
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

export const DEMO_CATALOG = {
  brand: {
    id: "seed_demo_brand",
    name: "دمویران",
    slug: "demo-brand",
  },
  category: {
    id: "seed_demo_category",
    name: "ابزار دمو",
    slug: "demo-tools",
  },
  product: {
    id: "seed_demo_product_1",
    name: "پیچ‌گوشتی برقی دمو",
    slug: "demo-screwdriver-12v",
  },
  variant: {
    id: "seed_demo_variant_1",
    sku: "DEMO-SCR-12V-S1",
    title: "پیچ‌گوشتی برقی ۱۲ ولت — نسخهٔ دمو",
    costPrice: 850_000n,
    salePrice: 1_250_000n,
  },
  warehouse: {
    id: "seed_demo_warehouse",
    code: "WH-DEMO",
    name: "انبار دمو",
    city: "تهران",
  },
  location: {
    id: "seed_demo_location",
    code: "WH-DEMO-A01",
    name: "مکان پیش‌فرض",
  },
  openingStock: 50,
};

function canonicalDemoSku(sku) {
  return sku.normalize("NFC").trim().replace(/\s+/g, " ").toUpperCase();
}

export async function seedDemoCatalog(
  prisma,
  { auditMode = "deterministic", auditSource = "deterministic-development-seed" } = {},
) {
  assertCanonicalIntegrity();

  const auditMetadata = {
    sku: DEMO_CATALOG.variant.sku,
    openingStock: DEMO_CATALOG.openingStock,
    source: auditSource,
  };

  return prisma.$transaction(async (transaction) => {
    await transaction.brand.upsert({
      where: { id: DEMO_CATALOG.brand.id },
      update: { name: DEMO_CATALOG.brand.name, slug: DEMO_CATALOG.brand.slug },
      create: { ...DEMO_CATALOG.brand },
    });

    await transaction.category.upsert({
      where: { id: DEMO_CATALOG.category.id },
      update: { name: DEMO_CATALOG.category.name, slug: DEMO_CATALOG.category.slug },
      create: { ...DEMO_CATALOG.category },
    });

    const product = await transaction.product.upsert({
      where: { slug: DEMO_CATALOG.product.slug },
      update: {
        name: DEMO_CATALOG.product.name,
        brandId: DEMO_CATALOG.brand.id,
        categoryId: DEMO_CATALOG.category.id,
        status: "ACTIVE",
      },
      create: {
        id: DEMO_CATALOG.product.id,
        name: DEMO_CATALOG.product.name,
        slug: DEMO_CATALOG.product.slug,
        brandId: DEMO_CATALOG.brand.id,
        categoryId: DEMO_CATALOG.category.id,
        status: "ACTIVE",
      },
    });

    const skuKey = canonicalDemoSku(DEMO_CATALOG.variant.sku);
    const variant = await transaction.productVariant.upsert({
      where: { sku: DEMO_CATALOG.variant.sku },
      update: {
        skuKey,
        title: DEMO_CATALOG.variant.title,
        costPrice: DEMO_CATALOG.variant.costPrice,
        salePrice: DEMO_CATALOG.variant.salePrice,
        status: "ACTIVE",
        isActive: true,
      },
      create: {
        id: DEMO_CATALOG.variant.id,
        productId: product.id,
        sku: DEMO_CATALOG.variant.sku,
        skuKey,
        title: DEMO_CATALOG.variant.title,
        costPrice: DEMO_CATALOG.variant.costPrice,
        salePrice: DEMO_CATALOG.variant.salePrice,
        status: "ACTIVE",
        isActive: true,
        combinationSignature: DEMO_EMPTY_AXIS_SIGNATURE,
      },
    });

    await transaction.variantPriceRecord.upsert({
      where: { id: "seed_demo_price_1" },
      update: {
        variantId: variant.id,
        costPrice: DEMO_CATALOG.variant.costPrice,
        salePrice: DEMO_CATALOG.variant.salePrice,
        source: "ADMIN",
      },
      create: {
        id: "seed_demo_price_1",
        variantId: variant.id,
        costPrice: DEMO_CATALOG.variant.costPrice,
        salePrice: DEMO_CATALOG.variant.salePrice,
        source: "ADMIN",
      },
    });

    await transaction.warehouse.upsert({
      where: { code: DEMO_CATALOG.warehouse.code },
      update: { name: DEMO_CATALOG.warehouse.name, city: DEMO_CATALOG.warehouse.city, isActive: true },
      create: { ...DEMO_CATALOG.warehouse, isActive: true },
    });

    const warehouse = await transaction.warehouse.findUniqueOrThrow({
      where: { code: DEMO_CATALOG.warehouse.code },
      select: { id: true },
    });

    await transaction.warehouseLocation.upsert({
      where: {
        warehouseId_code: {
          warehouseId: warehouse.id,
          code: DEMO_CATALOG.location.code,
        },
      },
      update: { name: DEMO_CATALOG.location.name, isActive: true },
      create: {
        id: DEMO_CATALOG.location.id,
        warehouseId: warehouse.id,
        code: DEMO_CATALOG.location.code,
        name: DEMO_CATALOG.location.name,
        isActive: true,
      },
    });

    const location = await transaction.warehouseLocation.findUniqueOrThrow({
      where: {
        warehouseId_code: {
          warehouseId: warehouse.id,
          code: DEMO_CATALOG.location.code,
        },
      },
      select: { id: true },
    });

    await transaction.inventoryBalance.upsert({
      where: {
        warehouseId_locationId_variantId: {
          warehouseId: warehouse.id,
          locationId: location.id,
          variantId: variant.id,
        },
      },
      update: {
        onHand: DEMO_CATALOG.openingStock,
        reserved: 0,
        available: DEMO_CATALOG.openingStock,
      },
      create: {
        warehouseId: warehouse.id,
        locationId: location.id,
        variantId: variant.id,
        onHand: DEMO_CATALOG.openingStock,
        reserved: 0,
        available: DEMO_CATALOG.openingStock,
      },
    });

    await transaction.inventoryMovement.upsert({
      where: { idempotencyKey: "seed_demo_opening_stock_1" },
      update: {
        warehouseId: warehouse.id,
        locationId: location.id,
        variantId: variant.id,
        type: "RECEIPT",
        quantity: DEMO_CATALOG.openingStock,
        beforeOnHand: 0,
        afterOnHand: DEMO_CATALOG.openingStock,
        referenceType: "seed",
        reason: "seed.catalog.demo.opening-stock",
      },
      create: {
        warehouseId: warehouse.id,
        locationId: location.id,
        variantId: variant.id,
        type: "RECEIPT",
        quantity: DEMO_CATALOG.openingStock,
        beforeOnHand: 0,
        afterOnHand: DEMO_CATALOG.openingStock,
        referenceType: "seed",
        reason: "seed.catalog.demo.opening-stock",
        idempotencyKey: "seed_demo_opening_stock_1",
      },
    });

    const auditBase = {
      action: "seed.catalog.demo",
      entityId: product.id,
      entityType: "Product",
      metadata: auditMetadata,
    };
    if (auditMode === "append") {
      await transaction.auditLog.create({ data: auditBase });
    } else {
      await transaction.auditLog.upsert({
        where: { id: "seed_audit_catalog_demo" },
        update: auditBase,
        create: { id: "seed_audit_catalog_demo", ...auditBase },
      });
    }

    return {
      locationId: location.id,
      productId: product.id,
      variantId: variant.id,
      warehouseId: warehouse.id,
    };
  });
}
