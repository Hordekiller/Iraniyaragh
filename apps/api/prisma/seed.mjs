import { createCipheriv, randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import * as argon2 from "argon2";
import { assertSeedEnvironment } from "./seed-policy.mjs";

const OPERATOR_PASSWORD_ARGON_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

const TOTP_ENVELOPE_VERSION = "v1";
const TOTP_KEY_BYTES = 32;
const TOTP_SECRET_PATTERN = /^[A-Z2-7]+$/iu;
const TOTP_ISSUER = "Iraniyaragh";

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

function deriveTotpEncryptionKey() {
  const value = process.env.AUTH_TOTP_ENCRYPTION_KEY;
  if (!value) {
    throw new Error("AUTH_TOTP_ENCRYPTION_KEY is required to seed the operator staff TOTP credential.");
  }
  const key = /^[0-9a-f]{64}$/iu.test(value) ? Buffer.from(value, "hex") : Buffer.from(value, "base64url");
  if (key.length !== TOTP_KEY_BYTES) {
    throw new Error("AUTH_TOTP_ENCRYPTION_KEY must decode to a 32-byte key (64 hex chars or 43 base64url chars).");
  }
  return key;
}

function encryptTotpSecret(secret) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveTotpEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    encryptedSecret: [
      TOTP_ENVELOPE_VERSION,
      iv.toString("base64url"),
      tag.toString("base64url"),
      ciphertext.toString("base64url"),
    ].join(":"),
    encryptionKeyVersion: TOTP_ENVELOPE_VERSION,
  };
}

/**
 * Test/development-only operator-staff bootstrap.
 *
 * Creates (or refreshes) one ACTIVE staff user that can complete the REAL
 * `/login` password + TOTP flow, so e2e coverage does not depend on the
 * development-only `/auth/dev/signin` harness. It is a pure environment
 * bootstrap: no default credential is stored here, `E2E_STAFF_EMAIL` must be
 * present for it to run at all, and the surrounding seed already refuses to
 * touch a production database (`assertSeedEnvironment`). Production first
 * administrators are created through the TTY-only bootstrap command required
 * by AUTH_CONTRACT §10, never through this path.
 *
 * - `E2E_STAFF_EMAIL` — enables the block; the staff identifier.
 * - `E2E_STAFF_PASSWORD` — hashed with the same argon2id parameters the API
 *   uses in `password-hash.service.ts`.
 * - `E2E_STAFF_TOTP_SECRET` — base32 secret, stored through the same
 *   AES-256-GCM envelope format as `totp-crypto.service.ts` and pre-confirmed so
 *   the TOTP step can be satisfied from the seed environment.
 * - `AUTH_TOTP_ENCRYPTION_KEY` — must match the key the running API uses, or the
 *   stored secret cannot be decrypted and MFA fails closed.
 */
async function seedOperatorStaff() {
  const email = process.env.E2E_STAFF_EMAIL ?? "";
  const password = process.env.E2E_STAFF_PASSWORD ?? "";
  const totpSecret = process.env.E2E_STAFF_TOTP_SECRET ?? "";
  if (!email || !password || !TOTP_SECRET_PATTERN.test(totpSecret)) {
    throw new Error(
      "E2E_STAFF_EMAIL and E2E_STAFF_PASSWORD must be set and E2E_STAFF_TOTP_SECRET must be a base32-encoded secret.",
    );
  }

  if (email.length > 254 || !email.includes("@")) {
    throw new Error("E2E_STAFF_EMAIL must be a valid email address.");
  }
  if (Array.from(password).length < 15 || Array.from(password).length > 128) {
    throw new Error("E2E_STAFF_PASSWORD must be 15-128 characters long.");
  }

  const passwordHash = await argon2.hash(password, OPERATOR_PASSWORD_ARGON_OPTIONS);
  const encrypted = encryptTotpSecret(totpSecret);
  const seededNow = new Date();

  return prisma.$transaction(async (transaction) => {
    const role = await transaction.role.findUnique({
      where: { key: SYSTEM_ADMIN_ROLE.key },
      select: { id: true },
    });
    if (!role) {
      throw new Error("System admin role is missing before operator-staff seeding.");
    }

    const user = await transaction.user.upsert({
      where: { email },
      update: {
        firstName: "Operator",
        lastName: "Staff",
        status: "ACTIVE",
        isEmailVerified: true,
        emailVerifiedAt: seededNow,
        passwordHash,
        updatedAt: seededNow,
      },
      create: {
        id: "seed_operator_staff",
        email,
        firstName: "Operator",
        lastName: "Staff",
        status: "ACTIVE",
        isEmailVerified: true,
        emailVerifiedAt: seededNow,
        passwordHash,
        createdAt: seededNow,
        updatedAt: seededNow,
      },
    });

    await transaction.totpCredential.upsert({
      where: { userId: user.id },
      update: {
        encryptedSecret: encrypted.encryptedSecret,
        encryptionKeyVersion: encrypted.encryptionKeyVersion,
        confirmedAt: seededNow,
        disabledAt: null,
        lastAcceptedStep: null,
        updatedAt: seededNow,
      },
      create: {
        userId: user.id,
        encryptedSecret: encrypted.encryptedSecret,
        encryptionKeyVersion: encrypted.encryptionKeyVersion,
        confirmedAt: seededNow,
        createdAt: seededNow,
        updatedAt: seededNow,
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
        id: "seed_operator_staff_role",
        userId: user.id,
        roleId: role.id,
        assignedById: null,
      },
    });

    await transaction.auditLog.upsert({
      where: { id: "seed_audit_operator_staff" },
      update: {
        action: "seed.operator.staff",
        entityId: user.id,
        entityType: "User",
        metadata: {
          subject: "seed-operator-staff",
          roleKey: SYSTEM_ADMIN_ROLE.key,
          totpConfirmation: "ENROLLED",
          source: "deterministic-test-bootstrap",
        },
      },
      create: {
        id: "seed_audit_operator_staff",
        action: "seed.operator.staff",
        entityId: user.id,
        entityType: "User",
        metadata: {
          subject: "seed-operator-staff",
          roleKey: SYSTEM_ADMIN_ROLE.key,
          totpConfirmation: "ENROLLED",
          source: "deterministic-test-bootstrap",
        },
      },
    });

    return { userId: user.id, roleId: role.id, provisioningUri: `otpauth://totp/${TOTP_ISSUER}:${encodeURIComponent(email)}?secret=${totpSecret}&issuer=${TOTP_ISSUER}` };
  });
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
  const configuredOperatorStaff =
    typeof process.env.E2E_STAFF_EMAIL === "string" &&
    process.env.E2E_STAFF_EMAIL.trim().length > 0;
  if (configuredOperatorStaff) {
    const operator = await seedOperatorStaff();
    console.log(
      `Seeded operator staff user (${operator.userId}) with ${SYSTEM_ADMIN_ROLE.key} role and confirmed TOTP.`,
    );
    console.log(`Operator TOTP provisioning URI: ${operator.provisioningUri}`);
  } else {
    console.log("E2E_STAFF_EMAIL not set; skipping the operator staff bootstrap.");
  }
} catch {
  console.error(
    "Database seed failed. Review the seed safety policy and database state.",
  );
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
