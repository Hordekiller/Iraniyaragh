import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assertSeedEnvironment } from "./seed-policy.mjs";

const localDevelopment = {
  ALLOW_DATABASE_SEED: "true",
  NODE_ENV: "development",
  DATABASE_URL: "postgresql://app:app@127.0.0.1:5432/iranyaragh?schema=public",
};

describe("assertSeedEnvironment", () => {
  it("accepts the explicit local development database", () => {
    assert.deepEqual(assertSeedEnvironment(localDevelopment), {
      databaseName: "iranyaragh",
      nodeEnvironment: "development",
    });
  });

  it("accepts an isolated test database", () => {
    assert.deepEqual(
      assertSeedEnvironment({
        ...localDevelopment,
        NODE_ENV: "test",
        DATABASE_URL:
          "postgresql://app:app@db.internal:5432/iraniyaragh_ci_test?schema=public",
      }),
      { databaseName: "iraniyaragh_ci_test", nodeEnvironment: "test" },
    );
  });

  it("requires explicit opt-in", () => {
    assert.throws(
      () =>
        assertSeedEnvironment({
          ...localDevelopment,
          ALLOW_DATABASE_SEED: undefined,
        }),
      /ALLOW_DATABASE_SEED=true/,
    );
  });

  it("rejects staging and production even with opt-in", () => {
    for (const NODE_ENV of ["staging", "production"]) {
      assert.throws(
        () => assertSeedEnvironment({ ...localDevelopment, NODE_ENV }),
        /development or test/,
      );
    }
  });

  it("rejects a remote development database", () => {
    assert.throws(
      () =>
        assertSeedEnvironment({
          ...localDevelopment,
          DATABASE_URL:
            "postgresql://app:app@database.example.com:5432/iranyaragh",
        }),
      /approved local database/,
    );
  });

  it("rejects a test database without the _test suffix", () => {
    assert.throws(
      () => assertSeedEnvironment({ ...localDevelopment, NODE_ENV: "test" }),
      /ending in _test/,
    );
  });

  it("rejects missing, malformed and non-PostgreSQL URLs", () => {
    for (const DATABASE_URL of [
      undefined,
      "not-a-url",
      "mysql://localhost/iranyaragh",
    ]) {
      assert.throws(() =>
        assertSeedEnvironment({ ...localDevelopment, DATABASE_URL }),
      );
    }
  });
});
