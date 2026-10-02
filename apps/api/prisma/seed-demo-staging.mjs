// Staging-only demo data bootstrap.
//
//   node prisma/seed-demo-staging.mjs --confirm
//
// Fenced to NODE_ENV=staging by demo-staging-policy.mjs. It does not use the
// development seed and does not relax seed-policy.mjs.
//
// It first reconciles the canonical RBAC baseline (so a demo environment is
// usable end to end), then applies the DEMO catalog fixtures. It creates no
// order, no payment, no payment confirmation and no SMS/notification delivery
// success, and it never creates a user or a credential.

import { PrismaClient } from "@prisma/client";
import { assertDemoStagingEnvironment } from "./demo-staging-policy.mjs";
import { seedDemoCatalog } from "./demo-catalog.mjs";
import { reconcileRbacBaseline } from "./rbac-baseline.mjs";

const prisma = new PrismaClient();
let exitCode = 0;

try {
  if (process.argv[2] !== "--confirm") {
    throw new Error(
      "Seeding demo staging data requires an explicit --confirm flag. This writes rows to a shared staging database.",
    );
  }

  const target = assertDemoStagingEnvironment(process.env);
  console.log(
    `Target: ${target.databaseName} (NODE_ENV=${target.nodeEnvironment}).`,
  );

  const baseline = await reconcileRbacBaseline(prisma, {
    auditMode: "append",
    auditSource: "demo-staging-bootstrap",
    databaseName: target.databaseName,
    nodeEnvironment: target.nodeEnvironment,
  });
  console.log(
    `Canonical RBAC baseline ready: ${baseline.permissionCount} permissions on role ${baseline.roleCount}.`,
  );

  const demo = await seedDemoCatalog(prisma, {
    auditMode: "append",
    auditSource: "demo-staging-bootstrap",
  });
  console.log(
    `Seeded DEMO catalog: product ${demo.productId}, variant ${demo.variantId}, warehouse ${demo.warehouseId}, location ${demo.locationId}.`,
  );
  console.log(
    "No order, payment or SMS success row was created. Provision the first administrator separately with apps/api auth:bootstrap.",
  );
} catch (error) {
  exitCode = 1;
  console.error(error instanceof Error ? error.message : String(error));
} finally {
  await prisma.$disconnect();
}

process.exitCode = exitCode;
