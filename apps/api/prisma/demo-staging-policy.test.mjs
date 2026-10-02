import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { assertDemoStagingEnvironment } from "./demo-staging-policy.mjs";

const staging = {
  ALLOW_DEMO_STAGING_DATA: "true",
  NODE_ENV: "staging",
  DATABASE_URL: "postgresql://app:secret@postgres:5432/iranyaragh?schema=public",
};

const read = name => readFileSync(new URL(name, import.meta.url), "utf8");

// Comments in these guards name what the code must not do, so non-use
// assertions run against the comment-stripped source.
const code = name =>
  read(name)
    .replace(/\/\*[\s\S]*?\*\//gu, "")
    .replace(/^[ \t]*\/\/.*$/gmu, "");

describe("assertDemoStagingEnvironment", () => {
  it("accepts staging with an explicit opt-in", () => {
    assert.deepEqual(assertDemoStagingEnvironment(staging), {
      databaseName: "iranyaragh",
      hostname: "postgres",
      nodeEnvironment: "staging",
    });
  });

  it("is fenced to staging and nowhere else", () => {
    for (const NODE_ENV of [
      undefined,
      "",
      "production",
      "development",
      "test",
      "Staging",
      "stagin",
    ]) {
      assert.throws(
        () => assertDemoStagingEnvironment({ ...staging, NODE_ENV }),
        /only when NODE_ENV=staging/,
      );
    }
  });

  it("requires explicit opt-in", () => {
    for (const ALLOW_DEMO_STAGING_DATA of [undefined, "false", "1", "TRUE", ""]) {
      assert.throws(
        () => assertDemoStagingEnvironment({ ...staging, ALLOW_DEMO_STAGING_DATA }),
        /ALLOW_DEMO_STAGING_DATA=true/,
      );
    }
  });

  it("rejects a disposable database target so CI state stays clean", () => {
    for (const database of ["iranyaragh_test", "iranyaragh_dev"]) {
      assert.throws(
        () =>
          assertDemoStagingEnvironment({
            ...staging,
            DATABASE_URL: `postgresql://app:secret@postgres:5432/${database}`,
          }),
        /must not target a disposable database/,
      );
    }
  });

  it("rejects missing, malformed and non-PostgreSQL URLs", () => {
    for (const DATABASE_URL of [undefined, "not-a-url", "mysql://postgres/iranyaragh"]) {
      assert.throws(() => assertDemoStagingEnvironment({ ...staging, DATABASE_URL }));
    }
  });

  it("never uses or relaxes the development seed guard", () => {
    const policy = code("demo-staging-policy.mjs");
    assert.equal(policy.includes("seed-policy"), false);
    assert.equal(policy.includes("ALLOW_DATABASE_SEED"), false);
    const entry = code("seed-demo-staging.mjs");
    assert.equal(entry.includes("seed-policy"), false);
    assert.equal(entry.includes("./seed.mjs"), false);
  });
});
