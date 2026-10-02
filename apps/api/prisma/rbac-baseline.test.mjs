import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  CANONICAL_PERMISSION_KEYS,
  CANONICAL_PERMISSIONS,
  CANONICAL_SYSTEM_ADMIN_ROLE,
  assertCanonicalIntegrity,
  inspectRbacBaseline,
  reconcileRbacBaseline,
} from "./rbac-baseline.mjs";

const read = name => readFileSync(new URL(name, import.meta.url), "utf8");

// The guarantees below are about executable code. Comments legitimately discuss
// the guarantees by name, so assertions that forbid a word or an identifier run
// against the comment-stripped source.
const code = name =>
  read(name)
    .replace(/\/\*[\s\S]*?\*\//gu, "")
    .replace(/^[ \t]*\/\/.*$/gmu, "");

// Identifiers that only ever belong to DEMO fixtures.
const DEMO_MARKERS = [
  "seed_demo_",
  "DEMO_CATALOG",
  "demo-brand",
  "demo-tools",
  "demo-screwdriver",
  "DEMO-SCR-12V-S1",
  "WH-DEMO",
  "دمو",
];

// Every Prisma model delegate touched by a file, so the write surface is an
// exact, reviewable set rather than a vibe. `prisma` itself is the client, and
// `$transaction` is not a model, so neither is a member of this set.
function modelsUsed(source) {
  return [
    ...new Set(
      [...source.matchAll(/\b(?:transaction|prisma)\.([a-zA-Z]+)\.[a-zA-Z]+/g)]
        .map(m => m[1])
        .filter(name => name !== 'prisma'),
    ),
  ].sort();
}

describe("canonical RBAC baseline registry", () => {
  it("is internally consistent", () => {
    assert.doesNotThrow(() => assertCanonicalIntegrity());
    assert.equal(CANONICAL_SYSTEM_ADMIN_ROLE.key, "system-admin");
  });

  it("has no duplicate permission keys", () => {
    assert.equal(
      new Set(CANONICAL_PERMISSION_KEYS).size,
      CANONICAL_PERMISSION_KEYS.length,
    );
  });

  it("defines every permission completely", () => {
    for (const permission of CANONICAL_PERMISSIONS) {
      assert.ok(permission.key, "key present");
      assert.ok(permission.name, `${permission.key} name present`);
      assert.ok(permission.group, `${permission.key} group present`);
      assert.match(permission.key, /^[a-z][a-z.]*[a-z]$/u);
    }
  });

  it("exposes the read-only inspector and the reconciler", () => {
    assert.equal(typeof inspectRbacBaseline, "function");
    assert.equal(typeof reconcileRbacBaseline, "function");
  });

  it("keeps the inspector genuinely read-only", () => {
    const source = read("rbac-baseline.mjs");
    const inspector = source.slice(
      source.indexOf("export async function inspectRbacBaseline"),
      source.indexOf("/**\n * Read-only prerequisite"),
    );
    for (const forbidden of [".create(", ".upsert(", ".update(", ".delete(", "$transaction"]) {
      assert.equal(inspector.includes(forbidden), false, `inspector must not call ${forbidden}`);
    }
  });
});

describe("RBAC baseline path scope", () => {
  it("touches only the canonical RBAC models and the audit log", () => {
    assert.deepEqual(modelsUsed(code("rbac-baseline.mjs")), [
      "auditLog",
      "permission",
      "role",
      "rolePermission",
    ]);
    assert.deepEqual(modelsUsed(code("apply-rbac-baseline.mjs")), []);
  });

  it("creates no user, credential or demo data", () => {
    for (const file of ["rbac-baseline.mjs", "apply-rbac-baseline.mjs"]) {
      const source = code(file);
      assert.equal(/\buser\.(create|upsert|update|delete)/u.test(source), false, `${file} writes no user`);
      assert.equal(/password/iu.test(source), false, `${file} mentions no password`);
      assert.equal(/argon/iu.test(source), false, `${file} mentions no hashing`);
      assert.equal(/totp|recoveryCode/iu.test(source), false, `${file} mentions no TOTP material`);
      for (const marker of DEMO_MARKERS) {
        assert.equal(source.includes(marker), false, `${file} has no demo marker ${marker}`);
      }
    }
  });

  it("never leaks the connection string or a secret into output", () => {
    const source = code("apply-rbac-baseline.mjs");
    // DATABASE_URL may be read by the guard, but only the parsed database name
    // is ever printed.
    assert.equal(source.includes("process.env.DATABASE_URL"), false);
    assert.equal(/console\.[a-z]+\(\s*`?\$\{?target\.hostname/u.test(source), false);
  });

  it("requires an explicit mode so a bare invocation cannot write", () => {
    const source = code("apply-rbac-baseline.mjs");
    assert.match(source, /--check/u);
    assert.match(source, /--apply/u);
    assert.match(source, /mutually exclusive/u);
  });

  it("restores revoked canonical grants rather than leaving drift", () => {
    const source = code("rbac-baseline.mjs");
    assert.match(source, /revokedAt: null/u);
    assert.match(source, /revokeReason: null/u);
  });
});

describe("demo catalog scope", () => {
  it("stops at catalog, pricing, warehouse and opening inventory", () => {
    assert.deepEqual(modelsUsed(code("demo-catalog.mjs")), [
      "auditLog",
      "brand",
      "category",
      "inventoryBalance",
      "inventoryMovement",
      "product",
      "productVariant",
      "variantPriceRecord",
      "warehouse",
      "warehouseLocation",
    ]);
  });

  it("fabricates no order, payment or SMS success", () => {
    const models = modelsUsed(code("demo-catalog.mjs"));
    for (const forbidden of ["order", "payment", "sms", "notification", "user", "role", "permission"]) {
      assert.equal(models.includes(forbidden), false, `demo catalog must not touch ${forbidden}`);
    }
    assert.equal(/paymentStatus|CONFIRMED|PAID/iu.test(code("demo-catalog.mjs")), false);
  });
});
