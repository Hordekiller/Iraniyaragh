import { PrismaClient } from "@prisma/client";
import { assertSeedEnvironment } from "./seed-policy.mjs";

const SYSTEM_ADMIN_ROLE = {
  id: "seed_role_system_admin",
  key: "system-admin",
  name: "System Administrator",
  description:
    "Seed-owned development role containing the canonical permission registry.",
};

const PERMISSIONS = [
  ["catalog.read", "Read catalog", "catalog"],
  ["catalog.write", "Manage catalog", "catalog"],
  ["catalog.media.read", "Read catalog media", "catalog"],
  ["catalog.media.write", "Manage catalog media", "catalog"],
  ["catalog.publish", "Publish catalog products", "catalog"],
  ["pricing.read", "Read pricing", "pricing"],
  ["pricing.write", "Manage pricing", "pricing"],
  ["inventory.read", "Read inventory", "inventory"],
  ["inventory.adjust", "Adjust inventory", "inventory"],
  ["inventory.transfer", "Transfer inventory", "inventory"],
  ["inventory.approve", "Approve inventory transfers", "inventory"],
  ["suppliers.read", "Read suppliers", "suppliers"],
  ["suppliers.manage", "Manage suppliers", "suppliers"],
  ["purchasing.read", "Read purchase orders", "purchasing"],
  ["purchasing.manage", "Create and edit purchase orders", "purchasing"],
  ["purchasing.approve", "Approve purchase orders", "purchasing"],
  ["purchasing.receive", "Receive purchase orders", "purchasing"],
  ["stocktake.read", "Read stocktakes", "stocktake"],
  ["stocktake.manage", "Manage stocktakes", "stocktake"],
  ["stocktake.count", "Record stocktake counts", "stocktake"],
  ["stocktake.approve", "Approve stocktakes", "stocktake"],
  ["orders.read", "Read orders", "orders"],
  ["orders.manage", "Manage orders", "orders"],
  ["shipments.read", "Read shipments", "shipments"],
  ["shipments.manage", "Manage shipments", "shipments"],
  ["payments.read", "Read payments", "payments"],
  ["payments.reconcile", "Recheck unconfirmed payments", "payments"],
  ["payments.refund", "Refund payments", "payments"],
  ["customers.read", "Read customers", "customers"],
  ["customers.manage", "Manage customers", "customers"],
  ["users.manage", "Manage users", "users"],
  ["roles.manage", "Manage roles", "roles"],
  ["reports.read", "Read reports", "reports"],
  ["audit.read", "Read audit history", "audit"],
  ["settings.manage", "Manage settings", "settings"],
].map(([key, name, group]) => ({
  description: `Canonical ${key} permission.`,
  group,
  id: `seed_permission_${key.replaceAll(".", "_")}`,
  key,
  name,
}));

const DEV_ADMIN_EMAIL = "dev-admin@iranyaragh.local";

const prisma = new PrismaClient();

async function seedRbacBaseline() {
  assertSeedEnvironment(process.env);

  return prisma.$transaction(async (transaction) => {
    const role = await transaction.role.upsert({
      where: { key: SYSTEM_ADMIN_ROLE.key },
      update: {
        description: SYSTEM_ADMIN_ROLE.description,
        isActive: true,
        isSystem: true,
        name: SYSTEM_ADMIN_ROLE.name,
      },
      create: {
        ...SYSTEM_ADMIN_ROLE,
        isActive: true,
        isSystem: true,
      },
    });

    const permissions = [];
    for (const definition of PERMISSIONS) {
      permissions.push(
        await transaction.permission.upsert({
          where: { key: definition.key },
          update: {
            description: definition.description,
            group: definition.group,
            isActive: true,
            name: definition.name,
          },
          create: {
            ...definition,
            isActive: true,
          },
        }),
      );
    }

    for (const permission of permissions) {
      await transaction.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            permissionId: permission.id,
            roleId: role.id,
          },
        },
        update: {
          revokeReason: null,
          revokedAt: null,
          revokedById: null,
        },
        create: {
          id: `seed_grant_${permission.key.replaceAll(".", "_")}`,
          permissionId: permission.id,
          roleId: role.id,
        },
      });
    }

    await transaction.auditLog.upsert({
      where: { id: "seed_audit_rbac_baseline" },
      update: {
        action: "seed.rbac.baseline",
        entityId: role.id,
        entityType: "Role",
        metadata: {
          permissionCount: permissions.length,
          source: "deterministic-development-seed",
        },
      },
      create: {
        id: "seed_audit_rbac_baseline",
        action: "seed.rbac.baseline",
        entityId: role.id,
        entityType: "Role",
        metadata: {
          permissionCount: permissions.length,
          source: "deterministic-development-seed",
        },
      },
    });

    return {
      permissionCount: permissions.length,
      roleCount: 1,
      rolePermissionCount: permissions.length,
    };
  });
}

async function seedDevAdmin() {
  return prisma.$transaction(async (transaction) => {
    const role = await transaction.role.findUnique({
      where: { key: SYSTEM_ADMIN_ROLE.key },
      select: { id: true },
    });
    if (!role) {
      throw new Error("System admin role is missing before dev-admin seeding.");
    }

    const seededNow = new Date();
    const user = await transaction.user.upsert({
      where: { email: DEV_ADMIN_EMAIL },
      update: {
        status: "ACTIVE",
        firstName: "Dev",
        lastName: "Administrator",
        isEmailVerified: true,
        emailVerifiedAt: seededNow,
        updatedAt: seededNow,
      },
      create: {
        id: "seed_dev_admin",
        email: DEV_ADMIN_EMAIL,
        firstName: "Dev",
        lastName: "Administrator",
        status: "ACTIVE",
        isEmailVerified: true,
        emailVerifiedAt: seededNow,
        createdAt: seededNow,
        updatedAt: seededNow,
        passwordHash: null,
      },
    });

    await transaction.userRole.upsert({
      where: {
        userId_roleId: {
          userId: user.id,
          roleId: role.id,
        },
      },
      update: {
        revokedAt: null,
        revokedById: null,
        revokeReason: null,
      },
      create: {
        id: "seed_dev_admin_role",
        userId: user.id,
        roleId: role.id,
        assignedById: null,
      },
    });

    await transaction.auditLog.upsert({
      where: { id: "seed_audit_dev_admin" },
      update: {
        action: "seed.dev.admin",
        entityId: user.id,
        entityType: "User",
        metadata: {
          subject: "seed-dev-admin",
          roleKey: SYSTEM_ADMIN_ROLE.key,
          source: "deterministic-development-seed",
        },
      },
      create: {
        id: "seed_audit_dev_admin",
        action: "seed.dev.admin",
        entityId: user.id,
        entityType: "User",
        metadata: {
          subject: "seed-dev-admin",
          roleKey: SYSTEM_ADMIN_ROLE.key,
          source: "deterministic-development-seed",
        },
      },
    });

    return { userId: user.id, roleId: role.id };
  });
}

const DEMO_EMPTY_AXIS_SIGNATURE =
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

const DEMO_CATALOG = {
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

async function seedDemoCatalog() {
  const transactionPrisma = (
    await prisma.$transaction(async (transaction) => {
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
          referenceId: product.id,
          reason: "seed.catalog.demo.opening-stock",
          idempotencyKey: "seed_demo_opening_stock_1",
        },
      });

      await transaction.auditLog.upsert({
        where: { id: "seed_audit_catalog_demo" },
        update: {
          action: "seed.catalog.demo",
          entityId: product.id,
          entityType: "Product",
          metadata: {
            sku: DEMO_CATALOG.variant.sku,
            openingStock: DEMO_CATALOG.openingStock,
            source: "deterministic-development-seed",
          },
        },
        create: {
          id: "seed_audit_catalog_demo",
          action: "seed.catalog.demo",
          entityId: product.id,
          entityType: "Product",
          metadata: {
            sku: DEMO_CATALOG.variant.sku,
            openingStock: DEMO_CATALOG.openingStock,
            source: "deterministic-development-seed",
          },
        },
      });

      return { warehouseId: warehouse.id, locationId: location.id, variantId: variant.id, productId: product.id };
    })
  );
  return transactionPrisma;
}

try {
  const result = await seedRbacBaseline();
  console.log(
    `Seeded RBAC baseline: ${result.permissionCount} permissions, ${result.roleCount} role, ${result.rolePermissionCount} grants.`,
  );
  const configuredDevCode =
    typeof process.env.AUTH_DEV_CODE === "string" && process.env.AUTH_DEV_CODE.trim().length > 0;
  if (configuredDevCode) {
    const devAdmin = await seedDevAdmin();
    console.log(`Seeded dev admin user (${devAdmin.userId}) with ${SYSTEM_ADMIN_ROLE.key} role.`);
  } else {
    console.log("AUTH_DEV_CODE not set; skipping the development admin user.");
  }
  const demoCatalog = await seedDemoCatalog();
  console.log(
    `Seeded demo catalog: product ${demoCatalog.productId}, variant ${demoCatalog.variantId}, warehouse ${demoCatalog.warehouseId}, location ${demoCatalog.locationId}.`,
  );
} catch {
  console.error(
    "Database seed failed. Review the seed safety policy and database state.",
  );
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
