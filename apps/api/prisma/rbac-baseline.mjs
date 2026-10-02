// Canonical RBAC baseline: the single source of truth for the roles,
// permissions and grants the platform itself requires.
//
// This module is deliberately free of environment, policy and demo concerns so
// that it can be shared by every path that needs the baseline:
//   - the development/test seed (`seed.mjs`),
//   - the official staging/production path (`apply-rbac-baseline.mjs`),
//   - the staging-only demo path (`seed-demo-staging.mjs`),
//   - the first-administrator prerequisite check (`scripts/bootstrap-admin.mjs`).
//
// It never creates a user, a credential, a password or any demo/fixture row.
// Reconcile is additive and idempotent: it creates what is missing, restores
// canonical definitions that were deactivated or revoked, and never deletes a
// grant an operator added deliberately.

export const CANONICAL_SYSTEM_ADMIN_ROLE = {
  key: "system-admin",
  name: "System Administrator",
  description:
    "System role owning the canonical permission registry required by the platform.",
};

export const CANONICAL_PERMISSIONS = [
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
  key,
  name,
  group,
  description: `Canonical ${key} permission.`,
}));

/**
 * Self-check on the canonical table itself, so a bad edit fails fast and
 * loudly rather than shipping a half-registered permission set.
 */
export function assertCanonicalIntegrity() {
  const keys = CANONICAL_PERMISSIONS.map((permission) => permission.key);
  const duplicates = [...new Set(keys.filter((key, i) => keys.indexOf(key) !== i))];
  if (duplicates.length > 0) {
    throw new Error(
      `Canonical permission registry contains duplicate keys: ${duplicates.join(", ")}`,
    );
  }

  for (const permission of CANONICAL_PERMISSIONS) {
    if (!permission.key || !permission.name || !permission.group) {
      throw new Error(
        `Canonical permission ${permission.key ?? "<missing key>"} needs a key, name and group.`,
      );
    }
  }

  if (!CANONICAL_SYSTEM_ADMIN_ROLE.key) {
    throw new Error("Canonical system role needs a key.");
  }
}

export const CANONICAL_PERMISSION_KEYS = CANONICAL_PERMISSIONS.map(
  (permission) => permission.key,
);

function permissionDrift(permission, canonical) {
  if (!permission) {
    return "missing";
  }
  if (permission.isActive === false) {
    return "inactive";
  }
  if (
    permission.name !== canonical.name ||
    permission.group !== canonical.group ||
    permission.description !== canonical.description
  ) {
    return "definition-mismatch";
  }
  return null;
}

/**
 * Read-only drift report. Used by `apply-rbac-baseline.mjs --check` to gate a
 * deployment, and by the first-administrator prerequisite check. Performs no
 * writes of any kind.
 */
export async function inspectRbacBaseline(prisma) {
  const role = await prisma.role.findUnique({
    where: { key: CANONICAL_SYSTEM_ADMIN_ROLE.key },
    select: {
      id: true,
      name: true,
      description: true,
      isActive: true,
      isSystem: true,
    },
  });

  const missingPermissionKeys = [];
  const driftedPermissions = [];
  if (role) {
    const existing = await prisma.permission.findMany({
      where: { key: { in: CANONICAL_PERMISSION_KEYS } },
      select: { key: true, name: true, group: true, description: true, isActive: true },
    });
    const byKey = new Map(existing.map((permission) => [permission.key, permission]));

    for (const canonical of CANONICAL_PERMISSIONS) {
      const drift = permissionDrift(byKey.get(canonical.key), canonical);
      if (drift === "missing") {
        missingPermissionKeys.push(canonical.key);
      } else if (drift) {
        driftedPermissions.push({ drift, key: canonical.key });
      }
    }

    const grants = await prisma.rolePermission.findMany({
      where: { roleId: role.id },
      select: {
        revokedAt: true,
        permission: { select: { key: true } },
      },
    });

    const grantedKeys = new Set();
    const revokedGrantKeys = [];
    for (const grant of grants) {
      grantedKeys.add(grant.permission.key);
      if (grant.revokedAt) {
        revokedGrantKeys.push(grant.permission.key);
      }
    }

    const missingGrantKeys = CANONICAL_PERMISSION_KEYS.filter(
      (key) => !grantedKeys.has(key),
    );
    const extraGrantKeys = [...grantedKeys]
      .filter((key) => !CANONICAL_PERMISSION_KEYS.includes(key))
      .sort();

    return {
      canonicalPermissionCount: CANONICAL_PERMISSIONS.length,
      driftedPermissions,
      extraGrantKeys,
      missingGrantKeys,
      missingPermissionKeys,
      ok:
        role.isActive === true &&
        role.isSystem === true &&
        role.name === CANONICAL_SYSTEM_ADMIN_ROLE.name &&
        role.description === CANONICAL_SYSTEM_ADMIN_ROLE.description &&
        missingPermissionKeys.length === 0 &&
        driftedPermissions.length === 0 &&
        missingGrantKeys.length === 0 &&
        revokedGrantKeys.length === 0,
      role: role
        ? {
            descriptionMatches: role.description === CANONICAL_SYSTEM_ADMIN_ROLE.description,
            isActive: role.isActive,
            isSystem: role.isSystem,
            name: role.name,
          }
        : null,
      revokedGrantKeys,
    };
  }

  return {
    canonicalPermissionCount: CANONICAL_PERMISSIONS.length,
    driftedPermissions: [],
    extraGrantKeys: [],
    missingGrantKeys: [...CANONICAL_PERMISSION_KEYS],
    missingPermissionKeys: [...CANONICAL_PERMISSION_KEYS],
    ok: false,
    role: null,
    revokedGrantKeys: [],
  };
}

/**
 * Read-only prerequisite used by `scripts/bootstrap-admin.mjs` before it asks an
 * operator for a password. Fails with the exact remediation command so the
 * operator is never prompted for a secret only to fail at commit time.
 */
export async function assertSystemAdminRolePresent(prisma) {
  const role = await prisma.role.findUnique({
    where: { key: CANONICAL_SYSTEM_ADMIN_ROLE.key },
    select: { id: true, isActive: true, isSystem: true },
  });

  if (!role) {
    throw new Error(
      `The ${CANONICAL_SYSTEM_ADMIN_ROLE.key} role is missing. Apply the canonical RBAC baseline first:\n` +
        "  pnpm --filter @iranyaragh/api rbac:baseline -- --apply",
    );
  }
  if (role.isActive !== true) {
    throw new Error(
      `The ${CANONICAL_SYSTEM_ADMIN_ROLE.key} role is inactive. Apply the canonical RBAC baseline first:\n` +
        "  pnpm --filter @iranyaragh/api rbac:baseline -- --apply",
    );
  }
  if (role.isSystem !== true) {
    throw new Error(
      `The ${CANONICAL_SYSTEM_ADMIN_ROLE.key} role is not flagged as a system role. Apply the canonical RBAC baseline first:\n` +
        "  pnpm --filter @iranyaragh/api rbac:baseline -- --apply",
    );
  }

  return role;
}

async function writeBaselineAudit(transaction, { auditMode, auditSource, databaseName, nodeEnvironment, result }) {
  const metadata = {
    canonicalPermissionCount: CANONICAL_PERMISSIONS.length,
    databaseName,
    nodeEnvironment,
    permissionCount: result.permissionCount,
    roleCount: result.roleCount,
    rolePermissionCount: result.rolePermissionCount,
    roleKey: CANONICAL_SYSTEM_ADMIN_ROLE.key,
    source: auditSource,
  };

  // The staging/production path appends one immutable audit row per run so the
  // baseline has a real trail. The deterministic development seed upserts a
  // fixed row instead, which is what the two-consecutive-runs CI check needs.
  if (auditMode === "append") {
    await transaction.auditLog.create({
      data: {
        action: "rbac.baseline.apply",
        entityId: result.roleId,
        entityType: "Role",
        metadata,
      },
    });
    return;
  }

  await transaction.auditLog.upsert({
    where: { id: "seed_audit_rbac_baseline" },
    create: {
      id: "seed_audit_rbac_baseline",
      action: "rbac.baseline.apply",
      entityId: result.roleId,
      entityType: "Role",
      metadata,
    },
    update: {
      action: "rbac.baseline.apply",
      entityId: result.roleId,
      entityType: "Role",
      metadata,
    },
  });
}

/**
 * Create or reconcile the canonical RBAC baseline inside a single transaction.
 *
 * Idempotent: running it twice leaves identical state. Additive: it never
 * removes a role, permission or grant that is not part of the canonical set,
 * so an operator's deliberate extra grant survives a re-run.
 */
export async function reconcileRbacBaseline(prisma, options = {}) {
  const { auditMode = "deterministic", auditSource = "unknown", databaseName = "unknown", nodeEnvironment = "unknown" } = options;
  assertCanonicalIntegrity();

  return prisma.$transaction(async (transaction) => {
    const role = await transaction.role.upsert({
      where: { key: CANONICAL_SYSTEM_ADMIN_ROLE.key },
      update: {
        description: CANONICAL_SYSTEM_ADMIN_ROLE.description,
        isActive: true,
        isSystem: true,
        name: CANONICAL_SYSTEM_ADMIN_ROLE.name,
      },
      create: {
        key: CANONICAL_SYSTEM_ADMIN_ROLE.key,
        description: CANONICAL_SYSTEM_ADMIN_ROLE.description,
        isActive: true,
        isSystem: true,
        name: CANONICAL_SYSTEM_ADMIN_ROLE.name,
      },
    });

    const permissions = [];
    for (const canonical of CANONICAL_PERMISSIONS) {
      permissions.push(
        await transaction.permission.upsert({
          where: { key: canonical.key },
          update: {
            description: canonical.description,
            group: canonical.group,
            isActive: true,
            name: canonical.name,
          },
          create: { ...canonical, isActive: true },
        }),
      );
    }

    let restoredGrantCount = 0;
    for (const permission of permissions) {
      // A canonical grant that was revoked is restored rather than left missing:
      // the baseline is the system requirement, and a revoked canonical grant is
      // drift away from it.
      const existing = await transaction.rolePermission.findUnique({
        where: {
          roleId_permissionId: { permissionId: permission.id, roleId: role.id },
        },
        select: { id: true, revokedAt: true },
      });
      if (existing?.revokedAt) {
        restoredGrantCount += 1;
      }
      await transaction.rolePermission.upsert({
        where: {
          roleId_permissionId: { permissionId: permission.id, roleId: role.id },
        },
        update: { revokeReason: null, revokedAt: null, revokedById: null },
        create: { permissionId: permission.id, roleId: role.id },
      });
    }

    const result = {
      permissionCount: permissions.length,
      restoredGrantCount,
      roleCount: 1,
      roleId: role.id,
      rolePermissionCount: permissions.length,
    };

    await writeBaselineAudit(transaction, {
      auditMode,
      auditSource,
      databaseName,
      nodeEnvironment,
      result,
    });

    return result;
  });
}
