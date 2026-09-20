import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "./migrations/20260919170000_guest_cart_runtime/migration.sql",
  import.meta.url,
);

test("guest cart migration enforces exclusive ownership and bounded replay data", async () => {
  const sql = await readFile(migrationUrl, "utf8");

  assert.match(sql, /ALTER COLUMN "customerId" DROP NOT NULL/u);
  assert.match(sql, /Cart_owner_exclusive/u);
  assert.match(sql, /Cart_guest_token_hash_shape/u);
  assert.match(sql, /Cart_guest_expiry_after_creation/u);
  assert.match(sql, /Cart_guestTokenHash_key/u);
  assert.match(sql, /CREATE TABLE "GuestCartMutation"/u);
  assert.match(sql, /GuestCartMutation_cartId_scope_keyHash_key/u);
  assert.match(sql, /ON DELETE CASCADE/u);
});
