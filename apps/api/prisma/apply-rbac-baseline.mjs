// Official path for the canonical RBAC baseline on a fresh staging/production
// database.
//
//   node prisma/apply-rbac-baseline.mjs --check   verify only, no writes, exit 1 on drift
//   node prisma/apply-rbac-baseline.mjs --apply   create/reconcile, write one audit row
//
// Guarded by rbac-baseline-policy.mjs (staging/production only, explicit
// opt-in, extra production confirmation). Creates only the canonical
// Role/Permission/RolePermission rows -- no user, no credential, no demo data.
// Idempotent: re-running leaves identical state and is safe at any time.
//
// Deliberately requires an explicit --check/--apply so no bare invocation can
// write to a production database.

import { PrismaClient } from "@prisma/client";
import { assertRbacBaselineEnvironment } from "./rbac-baseline-policy.mjs";
import {
  CANONICAL_SYSTEM_ADMIN_ROLE,
  inspectRbacBaseline,
  reconcileRbacBaseline,
} from "./rbac-baseline.mjs";

const MODES = new Set(["--check", "--apply"]);

function parseMode(argv) {
  const requested = argv.filter((argument) => MODES.has(argument));
  if (requested.length === 0) {
    throw new Error(
      "Specify exactly one mode: --check (verify only) or --apply (create/reconcile).",
    );
  }
  if (requested.length > 1) {
    throw new Error("--check and --apply are mutually exclusive.");
  }
  return requested[0];
}

function reportDrift(drift) {
  const problems = [];
  if (!drift.role) {
    problems.push(
      `role ${CANONICAL_SYSTEM_ADMIN_ROLE.key} is missing`,
    );
  } else {
    if (drift.role.isActive !== true) problems.push("role is inactive");
    if (drift.role.isSystem !== true) problems.push("role is not a system role");
    if (!drift.role.descriptionMatches) problems.push("role description differs");
  }
  if (drift.missingPermissionKeys.length > 0) {
    problems.push(
      `${drift.missingPermissionKeys.length} permission(s) missing: ${drift.missingPermissionKeys.join(", ")}`,
    );
  }
  for (const entry of drift.driftedPermissions) {
    problems.push(`permission ${entry.key} is ${entry.drift}`);
  }
  if (drift.missingGrantKeys.length > 0) {
    problems.push(
      `${drift.missingGrantKeys.length} grant(s) missing: ${drift.missingGrantKeys.join(", ")}`,
    );
  }
  if (drift.revokedGrantKeys.length > 0) {
    problems.push(
      `${drift.revokedGrantKeys.length} grant(s) revoked: ${drift.revokedGrantKeys.join(", ")}`,
    );
  }
  return problems;
}

const prisma = new PrismaClient();
let exitCode = 0;

try {
  const mode = parseMode(process.argv.slice(2));
  const target = assertRbacBaselineEnvironment(process.env);

  console.log(
    `Target: ${target.databaseName} (NODE_ENV=${target.nodeEnvironment}), mode ${mode}.`,
  );

  if (mode === "--check") {
    const drift = await inspectRbacBaseline(prisma);
    if (drift.ok) {
      console.log(
        `Canonical RBAC baseline is present: role ${CANONICAL_SYSTEM_ADMIN_ROLE.key}, ` +
          `${drift.canonicalPermissionCount} permissions, all granted.`,
      );
      if (drift.extraGrantKeys.length > 0) {
        // Reported, never removed: an extra grant is a deliberate operator
        // decision, not baseline drift.
        console.log(
          `Note: ${drift.extraGrantKeys.length} non-canonical grant(s) present and left untouched: ${drift.extraGrantKeys.join(", ")}`,
        );
      }
    } else {
      exitCode = 1;
      console.error("Canonical RBAC baseline is NOT satisfied:");
      for (const problem of reportDrift(drift)) {
        console.error(`  - ${problem}`);
      }
      console.error(
        "Apply it with: pnpm --filter @iranyaragh/api rbac:baseline -- --apply",
      );
    }
  } else {
    const result = await reconcileRbacBaseline(prisma, {
      auditMode: "append",
      auditSource: "official-rbac-baseline-path",
      databaseName: target.databaseName,
      nodeEnvironment: target.nodeEnvironment,
    });
    console.log(
      `Applied canonical RBAC baseline: ${result.roleCount} role, ` +
        `${result.permissionCount} permissions, ${result.rolePermissionCount} grants` +
        (result.restoredGrantCount > 0
          ? `, ${result.restoredGrantCount} revoked grant(s) restored.`
          : "."),
    );
    console.log(
      `No user, credential or demo data was created. Provision the first administrator with apps/api auth:bootstrap.`,
    );
  }
} catch (error) {
  exitCode = 1;
  console.error(error instanceof Error ? error.message : String(error));
} finally {
  await prisma.$disconnect();
}

process.exitCode = exitCode;
