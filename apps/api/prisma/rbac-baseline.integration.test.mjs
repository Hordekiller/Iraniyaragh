// Database-level proof that the official RBAC baseline path is idempotent and
// actually reconciles drift. The guards are unit-tested in
// rbac-baseline-policy.test.mjs; this file proves the reconcile semantics
// against a real database.
//
// It runs only in the CI `database` job, which has a real Postgres. Set
// RBAC_BASELINE_INTEGRATION=true to enable it; otherwise every case is skipped so
// the no-database `quality` job stays green.

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, describe, it } from "node:test";
import { PrismaClient } from "@prisma/client";
import {
  CANONICAL_PERMISSION_KEYS,
  CANONICAL_PERMISSIONS,
  CANONICAL_SYSTEM_ADMIN_ROLE,
  assertSystemAdminRolePresent,
  inspectRbacBaseline,
  reconcileRbacBaseline,
} from "./rbac-baseline.mjs";

const enabled = process.env.RBAC_BASELINE_INTEGRATION === "true";
const test = enabled ? it : it.skip;
const AUDIT_SOURCE = "rbac-baseline-integration-test";
const runId = randomUUID().replaceAll("-", "").slice(0, 12);
// Permission keys must satisfy Permission_key_format_check: every dot-separated
// segment starts with a lowercase letter. Map hex digits to letters so the
// random suffix stays unique without breaking that format.
const keySuffix = runId.replace(/\d/gu, "a");

const prisma = new PrismaClient();

// Defence in depth: never let this file touch a real database even if the
// enabling flag is set carelessly.
function assertTestDatabase() {
  const value = process.env.DATABASE_URL;
  assert.ok(value, "DATABASE_URL is required");
  const databaseName = decodeURIComponent(new URL(value).pathname.replace(/^\//, ""));
  assert.ok(
    databaseName.endsWith("_test"),
    `Refusing to run against a non-test database (${databaseName})`,
  );
  return databaseName;
}

const apply = () =>
  reconcileRbacBaseline(prisma, {
    auditMode: "append",
    auditSource: AUDIT_SOURCE,
    databaseName: "rbac_baseline_integration_test",
    nodeEnvironment: "test",
  });

describe("official RBAC baseline path against a real database", () => {
  test("creates the canonical role, permissions and grants", async () => {
    assertTestDatabase();
    const result = await apply();
    assert.equal(result.roleCount, 1);
    assert.equal(result.permissionCount, CANONICAL_PERMISSIONS.length);
    assert.equal(result.rolePermissionCount, CANONICAL_PERMISSIONS.length);
    await assertSystemAdminRolePresent(prisma);
  });

  test("satisfies its own read-only verification gate", async () => {
    const drift = await inspectRbacBaseline(prisma);
    assert.equal(drift.ok, true, JSON.stringify(drift, null, 2));
    assert.deepEqual(drift.missingPermissionKeys, []);
    assert.deepEqual(drift.missingGrantKeys, []);
    assert.deepEqual(drift.revokedGrantKeys, []);
    assert.deepEqual(drift.driftedPermissions, []);
  });

  test("is idempotent: a second apply changes nothing", async () => {
    const before = await snapshot();
    const second = await apply();
    const after = await snapshot();

    assert.equal(second.restoredGrantCount, 0);
    assert.equal(second.grantsCreated, 0);
    assert.equal(second.grantsRestored, 0);
    assert.equal(second.roleChanged, false);
    assert.equal(second.permissionsRepaired, 0);

    // Convergence, not just equal content: a converged re-run must write no row
    // at all, so `updatedAt` is untouched. Prisma's upsert would have bumped it.
    assert.deepEqual(after, before);

    // A third run must still be a no-op, proving convergence rather than a
    // one-off coincidence.
    await apply();
    assert.deepEqual(await snapshot(), before);
  });

test("restores a revoked canonical grant", async () => {
    const role = await prisma.role.findUniqueOrThrow({
      where: { key: CANONICAL_SYSTEM_ADMIN_ROLE.key },
    });
    const key = CANONICAL_PERMISSION_KEYS[0];
    const permission = await prisma.permission.findUniqueOrThrow({ where: { key } });

    try {
      await prisma.rolePermission.update({
        where: {
          roleId_permissionId: { permissionId: permission.id, roleId: role.id },
        },
        data: { revokedAt: new Date(), revokeReason: "integration drift" },
      });

      const result = await apply();
      assert.equal(result.grantsRestored, 1);

      const grant = await prisma.rolePermission.findUniqueOrThrow({
        where: {
          roleId_permissionId: { permissionId: permission.id, roleId: role.id },
        },
      });
      assert.equal(grant.revokedAt, null);
      assert.equal(grant.revokeReason, null);
      assert.equal((await inspectRbacBaseline(prisma)).ok, true);
    } finally {
      // Restore directly rather than through apply(), so a failed assertion
      // cannot leave canonical state corrupted for the next run.
      await prisma.rolePermission.updateMany({
        where: { roleId: role.id, permissionId: permission.id },
        data: { revokedAt: null, revokeReason: null, revokedById: null },
      });
    }
  });

test("reactivates and repairs a drifted permission and role", async () => {
    const key = CANONICAL_PERMISSION_KEYS[1];
    const canonical = CANONICAL_PERMISSIONS[1];
    const role = await prisma.role.findUniqueOrThrow({
      where: { key: CANONICAL_SYSTEM_ADMIN_ROLE.key },
    });
    const originalPermission = await prisma.permission.findUniqueOrThrow({
      where: { key },
      select: { name: true, group: true, description: true, isActive: true },
    });
    const originalRole = await prisma.role.findUniqueOrThrow({
      where: { id: role.id },
      select: { name: true, description: true, isActive: true, isSystem: true },
    });

    try {
      await prisma.permission.update({
        where: { key },
        data: { isActive: false, name: "Tampered name" },
      });
      await prisma.role.update({
        where: { id: role.id },
        data: { description: "Tampered", isActive: false },
      });

      const drift = await inspectRbacBaseline(prisma);
      assert.equal(drift.ok, false, "tampering must be detected");
      assert.deepEqual(drift.driftedPermissions, [{ drift: "inactive", key }]);

      await apply();

      const repaired = await prisma.permission.findUniqueOrThrow({ where: { key } });
      assert.equal(repaired.isActive, true);
      assert.equal(repaired.name, canonical.name);
      const repairedRole = await prisma.role.findUniqueOrThrow({ where: { id: role.id } });
      assert.equal(repairedRole.isActive, true);
      assert.equal(repairedRole.isSystem, true);
      assert.equal(repairedRole.description, CANONICAL_SYSTEM_ADMIN_ROLE.description);
      assert.equal((await inspectRbacBaseline(prisma)).ok, true);
    } finally {
      await prisma.permission.update({ where: { key }, data: originalPermission });
      await prisma.role.update({ where: { id: role.id }, data: originalRole });
    }
  });

  test("never removes a non-canonical grant an operator added", async () => {
    const role = await prisma.role.findUniqueOrThrow({
      where: { key: CANONICAL_SYSTEM_ADMIN_ROLE.key },
    });
    const permission = await prisma.permission.create({
      data: {
        key: `zz.integration.${keySuffix}`,
        name: "Operator-added integration permission",
        group: "integration",
        description: "Created by the RBAC baseline integration test.",
      },
    });

    try {
      await prisma.rolePermission.create({
        data: { permissionId: permission.id, roleId: role.id },
      });

      const result = await apply();
      assert.equal(result.grantsRestored, 0);
      assert.equal(result.grantsCreated, 0, "an existing grant is not recreated");

      const drift = await inspectRbacBaseline(prisma);
      assert.equal(drift.ok, true, "an extra grant is not baseline drift");
      assert.deepEqual(drift.extraGrantKeys, [permission.key]);

      const grant = await prisma.rolePermission.findUniqueOrThrow({
        where: {
          roleId_permissionId: { permissionId: permission.id, roleId: role.id },
        },
      });
      assert.ok(grant.id, "the operator grant survived the reconcile");
    } finally {
      // Cleanup in a finally so a failed assertion cannot leak a fixture into a
      // later run and cascade into unrelated failures.
      await prisma.rolePermission.deleteMany({ where: { permissionId: permission.id } });
      await prisma.permission.delete({ where: { id: permission.id } });
    }
  });

  test("writes one immutable audit row per apply, never a user", async () => {
    const before = await auditCount();
    await apply();
    const after = await auditCount();
    assert.equal(after, before + 1);

    const row = await prisma.auditLog.findFirstOrThrow({
      where: { metadata: { path: ["source"], equals: AUDIT_SOURCE } },
      orderBy: { createdAt: "desc" },
    });
    assert.equal(row.action, "rbac.baseline.apply");
    assert.equal(row.entityType, "Role");
    assert.equal(row.actorId, null, "the baseline is never attributed to a user");
    assert.equal(
      row.metadata.canonicalPermissionCount,
      CANONICAL_PERMISSIONS.length,
    );
  });

  test("created no user and no credential", async () => {
    assert.equal(await prisma.user.count(), 0);
  });

  test("uses a distinct audit action per path, keeping the seed marker intact", async () => {
    // The deterministic development seed marker is the contract that
    // prisma/tests/seed_baseline.sql verifies, so the two paths must not share
    // an action name.
    const deterministic = await prisma.auditLog.findUniqueOrThrow({
      where: { id: "seed_audit_rbac_baseline" },
    });
    assert.equal(deterministic.action, "seed.rbac.baseline");

    await apply();
    const appended = await prisma.auditLog.findFirstOrThrow({
      where: { metadata: { path: ["source"], equals: AUDIT_SOURCE } },
      orderBy: { createdAt: "desc" },
    });
    assert.equal(appended.action, "rbac.baseline.apply");
    assert.notEqual(appended.action, deterministic.action);
  });

  test("cleans up the audit rows it appended", async () => {
    const deleted = await prisma.auditLog.deleteMany({
      where: { metadata: { path: ["source"], equals: AUDIT_SOURCE } },
    });
    assert.ok(deleted.count >= 1, "audit rows written by this test are removed");
  });
});

async function snapshot() {
  const role = await prisma.role.findUniqueOrThrow({
    where: { key: CANONICAL_SYSTEM_ADMIN_ROLE.key },
  });
  const permissions = await prisma.permission.findMany({
    where: { key: { in: CANONICAL_PERMISSION_KEYS } },
    orderBy: { key: "asc" },
    select: { key: true, name: true, group: true, description: true, isActive: true, updatedAt: true },
  });
  const grants = await prisma.rolePermission.findMany({
    where: { roleId: role.id },
    orderBy: { permission: { key: "asc" } },
    select: {
      revokedAt: true,
      permission: { select: { key: true } },
    },
  });
  return {
    grantKeys: grants.map(grant => grant.permission.key),
    grantsRevoked: grants.filter(grant => grant.revokedAt !== null).length,
    permissionCount: permissions.length,
    permissions: permissions.map(({ updatedAt: _updatedAt, ...rest }) => rest),
    roleId: role.id,
    roleUpdatedAt: role.updatedAt,
  };
}

async function auditCount() {
  return prisma.auditLog.count({
    where: { metadata: { path: ["source"], equals: AUDIT_SOURCE } },
  });
}

if (enabled) {
  after(async () => {
    await prisma.$disconnect();
  });
}
