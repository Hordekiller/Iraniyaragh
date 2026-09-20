import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL(
  './migrations/20260920200000_dashboard_summary_indexes/migration.sql',
  import.meta.url,
);

test('dashboard summary migration keeps every uncovered scan index-backed', async () => {
  const sql = await readFile(migrationUrl, 'utf8');

  for (const statement of [
    'CREATE INDEX "Order_createdAt_idx" ON "Order"("createdAt")',
    'CREATE INDEX "Payment_status_idx" ON "Payment"("status")',
    'CREATE INDEX "InventoryBalance_available_idx" ON "InventoryBalance"("available")',
    'CREATE INDEX "StockReservation_status_idx" ON "StockReservation"("status")',
    'CREATE INDEX "StockTransfer_status_idx" ON "StockTransfer"("status")',
  ]) {
    assert.ok(sql.includes(statement), `Missing required index DDL: ${statement}`);
  }
});
