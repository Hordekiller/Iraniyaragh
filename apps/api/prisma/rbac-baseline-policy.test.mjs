import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { assertRbacBaselineEnvironment } from "./rbac-baseline-policy.mjs";

const staging = {
  ALLOW_RBAC_BASELINE: "true",
  NODE_ENV: "staging",
  DATABASE_URL: "postgresql://app:secret@postgres:5432/iranyaragh?schema=public",
};

const read = name => readFileSync(new URL(name, import.meta.url), "utf8");

// These guards document themselves in comments, and those comments legitimately
// name the things the code must not do. Assertions about non-use therefore run
// against the comment-stripped source.
const code = name =>
  read(name)
    .replace(/\/\*[\s\S]*?\*\//gu, "")
    .replace(/^[ \t]*\/\/.*$/gmu, "");

describe("assertRbacBaselineEnvironment", () => {
  it("accepts staging with an explicit opt-in", () => {
    assert.deepEqual(assertRbacBaselineEnvironment(staging), {
      databaseName: "iranyaragh",
      hostname: "postgres",
      nodeEnvironment: "staging",
      productionConfirmed: false,
    });
  });

  it("accepts production only with the second explicit confirmation", () => {
    assert.deepEqual(
      assertRbacBaselineEnvironment({
        ...staging,
        NODE_ENV: "production",
        RBAC_BASELINE_CONFIRM_PRODUCTION: "apply-canonical-rbac-baseline",
      }),
      {
        databaseName: "iranyaragh",
        hostname: "postgres",
        nodeEnvironment: "production",
        productionConfirmed: true,
      },
    );
  });

  it("rejects production with the opt-in alone", () => {
    assert.throws(
      () => assertRbacBaselineEnvironment({ ...staging, NODE_ENV: "production" }),
      /RBAC_BASELINE_CONFIRM_PRODUCTION=apply-canonical-rbac-baseline/,
    );
  });

  it("rejects production with a wrong confirmation phrase", () => {
    assert.throws(
      () =>
        assertRbacBaselineEnvironment({
          ...staging,
          NODE_ENV: "production",
          RBAC_BASELINE_CONFIRM_PRODUCTION: "yes",
        }),
      /RBAC_BASELINE_CONFIRM_PRODUCTION/,
    );
  });

  it("requires explicit opt-in", () => {
    for (const ALLOW_RBAC_BASELINE of [undefined, "false", "1", "TRUE", ""]) {
      assert.throws(
        () => assertRbacBaselineEnvironment({ ...staging, ALLOW_RBAC_BASELINE }),
        /ALLOW_RBAC_BASELINE=true/,
      );
    }
  });

  it("fails closed on a mistyped environment rather than falling through", () => {
    for (const NODE_ENV of [
      undefined,
      "",
      "stagign",
      "prod",
      "Staging",
      "STAGING",
      "development",
      "test",
    ]) {
      assert.throws(
        () => assertRbacBaselineEnvironment({ ...staging, NODE_ENV }),
        /only in staging or production/,
      );
    }
  });

  it("rejects a disposable database target in both environments", () => {
    for (const database of ["iranyaragh_test", "iranyaragh_dev"]) {
      assert.throws(
        () =>
          assertRbacBaselineEnvironment({
            ...staging,
            DATABASE_URL: `postgresql://app:secret@postgres:5432/${database}`,
          }),
        /must not target a disposable database/,
      );
    }
  });

  it("rejects missing, malformed and non-PostgreSQL URLs", () => {
    for (const DATABASE_URL of [undefined, "not-a-url", "mysql://postgres/iranyaragh"]) {
      assert.throws(() => assertRbacBaselineEnvironment({ ...staging, DATABASE_URL }));
    }
  });

  it("never consults the development seed opt-in", () => {
    // ALLOW_DATABASE_SEED must be irrelevant: this path does not use the
    // development seed, so a host that sets it gains nothing.
    const policy = code("rbac-baseline-policy.mjs");
    assert.equal(policy.includes("ALLOW_DATABASE_SEED"), false);
    assert.equal(policy.includes("seed-policy"), false);
    assert.equal(code("apply-rbac-baseline.mjs").includes("seed-policy"), false);
  });
});
