import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL(
  './migrations/20260917130000_checkout_runtime/migration.sql',
  import.meta.url,
);

test('checkout migration retains atomicity and financial safety invariants', async () => {
  const sql = await readFile(migrationUrl, 'utf8');

  assert.match(sql, /CREATE TABLE "ShippingMethod"/u);
  assert.match(sql, /CREATE TABLE "ShippingQuote"/u);
  assert.match(sql, /CREATE TABLE "CheckoutIdempotencyRecord"/u);
  assert.match(sql, /CREATE TABLE "OutboxEvent"/u);
  assert.match(
    sql,
    /CheckoutIdempotencyRecord_customerId_scope_keyHash_key/u,
  );
  assert.match(sql, /OutboxEvent_deduplicationKey_key/u);
  assert.match(sql, /ADD COLUMN "shippingMethodTitle" VARCHAR\(120\)/u);
  assert.match(sql, /OrderItem_orderId_ordinal_key/u);
  assert.match(sql, /ALTER COLUMN "status" SET DEFAULT 'DRAFT'/u);
  assert.match(sql, /Order_checkout_money[\s\S]+"grandTotal" = "subtotal" - "discount" \+ "shipping"/u);
  assert.match(sql, /Order_checkout_snapshot[\s\S]+"shippingMethodTitle"/u);
  assert.match(sql, /OrderItem_checkout_values[\s\S]+"ordinal" >= 0[\s\S]+"quantity" > 0/u);
  assert.match(sql, /StockReservation_quantity_positive/u);
  assert.match(
    sql,
    /InventoryBalance_consistent[\s\S]+"available" = "onHand" - "reserved"/u,
  );
  assert.match(
    sql,
    /UPDATE "Order"[\s\S]+jsonb_build_object\('legacy', true\)[\s\S]+ALTER COLUMN "addressSnapshot" SET NOT NULL/u,
  );
  assert.match(
    sql,
    /ALTER TABLE "OrderTransition" ALTER COLUMN "requestId" TYPE VARCHAR\(128\)/u,
  );
  assert.doesNotMatch(sql, /"idempotencyKey"/u);
});
