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
  ["pricing.read", "Read pricing", "pricing"],
  ["pricing.write", "Manage pricing", "pricing"],
  ["inventory.read", "Read inventory", "inventory"],
  ["inventory.adjust", "Adjust inventory", "inventory"],
  ["inventory.transfer", "Transfer inventory", "inventory"],
  ["orders.read", "Read orders", "orders"],
  ["orders.manage", "Manage orders", "orders"],
  ["shipments.read", "Read shipments", "shipments"],
  ["shipments.manage", "Manage shipments", "shipments"],
  ["payments.read", "Read payments", "payments"],
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

// ADR-0014 §4.3 initial separation-of-duty sets. Keys may reference permissions
// that are registered later (finance.approve.*), so they are plain strings.
const SOD_RESTRICTIONS = [
  {
    key: "sod-pricing-write-vs-approve-pricing",
    name: "Pricing writer vs pricing approver",
    description:
      "pricing.write and the future finance.approve.pricing are mutually exclusive (ADR-0014 §4.3).",
    permissionKeys: ["pricing.write", "finance.approve.pricing"],
    isActive: true,
  },
  {
    key: "sod-discount-refund-originator-vs-approver",
    name: "Order discount/refund originator vs approver",
    description:
      "Order discount/refund originator and its approver are mutually exclusive (ADR-0014 §4.3).",
    permissionKeys: ["orders.manage", "finance.approve.discount", "finance.approve.refund"],
    isActive: true,
  },
  {
    key: "sod-roles-manage-vs-audit-read",
    name: "Roles manager vs audit reader",
    description:
      "roles.manage and audit.read are deliberately not both held by one person when payroll-like power matters (ADR-0014 §4.3). Configurable; off by default because the seed system-admin owns both.",
    permissionKeys: ["roles.manage", "audit.read"],
    isActive: false,
  },
];

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

    for (const restriction of SOD_RESTRICTIONS) {
      await transaction.soDRestriction.upsert({
        where: { key: restriction.key },
        update: {
          name: restriction.name,
          description: restriction.description,
          permissionKeys: restriction.permissionKeys,
          isActive: restriction.isActive,
        },
        create: {
          id: `seed_sod_${restriction.key}`,
          ...restriction,
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
          sodRestrictionCount: SOD_RESTRICTIONS.length,
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
          sodRestrictionCount: SOD_RESTRICTIONS.length,
          source: "deterministic-development-seed",
        },
      },
    });

    return {
      permissionCount: permissions.length,
      roleCount: 1,
      rolePermissionCount: permissions.length,
      sodRestrictionCount: SOD_RESTRICTIONS.length,
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

try {
  const result = await seedRbacBaseline();
  console.log(
    `Seeded RBAC baseline: ${result.permissionCount} permissions, ${result.roleCount} role, ${result.rolePermissionCount} grants, ${result.sodRestrictionCount} SoD sets.`,
  );
  const configuredDevCode =
    typeof process.env.AUTH_DEV_CODE === "string" && process.env.AUTH_DEV_CODE.trim().length > 0;
  if (configuredDevCode) {
    const devAdmin = await seedDevAdmin();
    console.log(`Seeded dev admin user (${devAdmin.userId}) with ${SYSTEM_ADMIN_ROLE.key} role.`);
  } else {
    console.log("AUTH_DEV_CODE not set; skipping the development admin user.");
  }
} catch {
  console.error(
    "Database seed failed. Review the seed safety policy and database state.",
  );
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
