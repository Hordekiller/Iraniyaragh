import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrations = [
  ['20260920200000_dashboard_summary_indexes', 'Order_createdAt_idx', 'Order', 'createdAt'],
  ['20260920200100_dashboard_payment_status_index', 'Payment_status_idx', 'Payment', 'status'],
  [
    '20260920200200_dashboard_inventory_available_index',
    'InventoryBalance_available_idx',
    'InventoryBalance',
    'available',
  ],
  [
    '20260920200300_dashboard_reservation_status_index',
    'StockReservation_status_idx',
    'StockReservation',
    'status',
  ],
  [
    '20260920200400_dashboard_transfer_status_index',
    'StockTransfer_status_idx',
    'StockTransfer',
    'status',
  ],
];

test('dashboard summary migration keeps every uncovered scan index-backed', async () => {
  for (const [directory, index, table, column] of migrations) {
    const migrationUrl = new URL(`./migrations/${directory}/migration.sql`, import.meta.url);
    const sql = await readFile(migrationUrl, 'utf8');
    const statement = `CREATE INDEX CONCURRENTLY "${index}" ON "${table}"("${column}")`;

    assert.ok(sql.includes(statement), `Missing required index DDL: ${statement}`);
    assert.equal(
      sql.match(/CREATE\s+INDEX/gi)?.length,
      1,
      `${directory} must contain exactly one CREATE INDEX statement`,
    );
    assert.doesNotMatch(sql, /\b(?:BEGIN|COMMIT)\b\s*;/i);
  }
});
