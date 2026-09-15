import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL(
  './migrations/20260915090000_product_media/migration.sql',
  import.meta.url,
);

test('product media migration retains database-level safety invariants', async () => {
  const sql = await readFile(migrationUrl, 'utf8');

  assert.match(sql, /ProductMedia_active_position_key[\s\S]+WHERE "state" <> 'ARCHIVED'/u);
  assert.match(sql, /ProductMedia_active_primary_key[\s\S]+"role" = 'PRIMARY' AND "state" <> 'ARCHIVED'/u);
  assert.match(sql, /ProductMedia_ready_metadata_check/u);
  assert.match(sql, /ProductMedia_primary_kind_check/u);
  assert.match(sql, /ProductMedia_archive_timestamp_check/u);
  assert.match(sql, /REFERENCES "Product"\("id"\) ON DELETE RESTRICT/u);
  assert.match(sql, /REFERENCES "User"\("id"\) ON DELETE RESTRICT/u);
});
