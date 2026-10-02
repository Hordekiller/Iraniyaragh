// Deterministic development/test seed.
//
// Guarded by seed-policy.mjs (development or test only). It is NOT the path for
// a staging or production database: it also applies DEMO catalog fixtures, which
// must never land in a real environment. Use apply-rbac-baseline.mjs for the
// canonical RBAC baseline there, and seed-demo-staging.mjs for staging demo data.
//
// The canonical baseline and the demo fixtures now live in shared modules so
// there is exactly one definition of the permission registry.

import { PrismaClient } from "@prisma/client";
import { assertSeedEnvironment } from "./seed-policy.mjs";
import { reconcileRbacBaseline } from "./rbac-baseline.mjs";
import { seedDemoCatalog } from "./demo-catalog.mjs";

const prisma = new PrismaClient();

try {
  assertSeedEnvironment(process.env);

  const result = await reconcileRbacBaseline(prisma, {
    auditMode: "deterministic",
    auditSource: "deterministic-development-seed",
  });
  console.log(
    `Seeded RBAC baseline: ${result.permissionCount} permissions, ${result.roleCount} role, ${result.rolePermissionCount} grants.`,
  );
  console.log(
    "No privileged user is seeded. Provision the first administrator explicitly (apps/api auth:bootstrap for operators, provision-e2e-staff for automated tests).",
  );
  const demoCatalog = await seedDemoCatalog(prisma, {
    auditMode: "deterministic",
    auditSource: "deterministic-development-seed",
  });
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
