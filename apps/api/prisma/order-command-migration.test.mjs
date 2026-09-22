import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL(
  './migrations/20260922100000_order_command_idempotency/migration.sql',
  import.meta.url,
);

test('order command migration keeps idempotency exactly-once invariants', async () => {
  const sql = await readFile(migrationUrl, 'utf8');

  assert.match(sql, /CREATE TABLE "OrderCommandIdempotencyRecord"/u);
  assert.match(
    sql,
    /OrderCommandIdempotencyRecord_orderId_scope_keyHash_key/u,
  );
  assert.match(sql, /OrderCommandIdempotencyRecord_expiresAt_idx/u);
  assert.match(
    sql,
    /"keyHash" CHAR\(64\)[\s\S]+"fingerprint" CHAR\(64\)[\s\S]+"responseJson" JSONB/u,
  );
  assert.match(sql, /"expiresAt" > "createdAt"/u);
  assert.match(sql, /references "Order"\("id"\)/i);
  assert.match(sql, /ON DELETE RESTRICT/u);
  assert.doesNotMatch(sql, /"idempotencyKey"/u);
});

const indexMigrationUrl = new URL(
  './migrations/20260922100100_order_reservation_order_status_index/migration.sql',
  import.meta.url,
);

test('order reservation index migration is a single non-transactional statement', async () => {
  const raw = await readFile(indexMigrationUrl, 'utf8');
  const withoutComments = raw
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
  const statements = withoutComments
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean);

  assert.equal(statements.length, 1);
  assert.match(
    statements[0],
    /^CREATE INDEX CONCURRENTLY "StockReservation_orderId_status_idx"/u,
  );
  assert.match(statements[0], /ON\s+"StockReservation"\("orderId", "status"\)/u);
});