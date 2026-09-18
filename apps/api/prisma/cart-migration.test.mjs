import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "./migrations/20260918143000_cart_correctness_hardening/migration.sql",
  import.meta.url,
);

test("cart hardening migration retains replay safety invariants", async () => {
  const sql = await readFile(migrationUrl, "utf8");

  assert.match(sql, /ADD COLUMN "scope" VARCHAR\(100\)/u);
  assert.match(sql, /ADD COLUMN "keyHash" CHAR\(64\)/u);
  assert.match(sql, /ADD COLUMN "expiresAt" TIMESTAMP\(3\)/u);
  assert.match(sql, /"expiresAt" = "createdAt" \+ INTERVAL '24 hours'/u);
  assert.match(sql, /DELETE FROM "CartMutation"[\s\S]+CURRENT_TIMESTAMP/u);
  assert.match(sql, /CartMutation_identity_exclusive/u);
  assert.match(sql, /CartMutation_key_hash_shape/u);
  assert.match(sql, /CartMutation_expiry_after_creation/u);
  assert.match(sql, /CartMutation_customerId_scope_keyHash_key/u);
  assert.match(sql, /CartMutation_expiresAt_idx/u);
  assert.match(sql, /ALTER COLUMN "cartId" DROP NOT NULL/u);
});
