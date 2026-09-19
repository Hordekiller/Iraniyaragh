import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL(
  './migrations/20260918233000_stock_transfer_optimistic_version/migration.sql',
  import.meta.url,
);

test('stock transfer version migration adds a nonnegative optimistic lock', async () => {
  const sql = await readFile(migrationUrl, 'utf8');

  assert.match(sql, /ALTER TABLE "StockTransfer"/);
  assert.match(sql, /ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0/);
  assert.match(sql, /CHECK \("version" >= 0\)/);
});
