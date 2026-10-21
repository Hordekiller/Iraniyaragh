import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL(
  './migrations/20261021110000_product_attribute_configuration_sort_order/migration.sql',
  import.meta.url,
);

test('attribute configuration sort order migration is additive and identity-safe', async () => {
  const sql = await readFile(migrationUrl, 'utf8');

  // Additive only: no existing column is dropped or rewritten, so the
  // migration is safe to run against a populated catalog.
  assert.match(sql, /ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0/u);
  assert.doesNotMatch(sql, /DROP COLUMN/u);
  assert.doesNotMatch(sql, /DELETE FROM/u);
  assert.doesNotMatch(sql, /UPDATE /u);

  // The storefront needs a stable read order for the selector cascade.
  assert.match(sql, /ON "ProductAttributeConfiguration" \("productId", "sortOrder"\)/u);
});
