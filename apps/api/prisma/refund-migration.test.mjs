import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "./migrations/20260925190000_payment_refund_recording/migration.sql",
  import.meta.url,
);

const consistencyMigrationUrl = new URL(
  "./migrations/20260926120000_refund_total_consistency/migration.sql",
  import.meta.url,
);

test("refund migration keeps the refunded total inside the captured amount", async () => {
  const sql = await readFile(migrationUrl, "utf8");

  assert.match(sql, /CREATE TYPE "RefundStatus" AS ENUM \('RECORDED'\)/u);
  assert.match(sql, /ADD COLUMN "refundedAmount" BIGINT NOT NULL DEFAULT 0/u);
  assert.match(
    sql,
    /ADD CONSTRAINT "Payment_refundedAmount_within_amount"\s*CHECK \("refundedAmount" >= 0 AND "refundedAmount" <= "amount"\)/u,
  );
});

test("refund migration makes a refund an append-only, exactly-once evidence row", async () => {
  const sql = await readFile(migrationUrl, "utf8");

  assert.match(sql, /CREATE TABLE "Refund"/u);
  // The gateway panel reference is the only external evidence and must be
  // present, non-blank and unique across every payment.
  assert.match(sql, /"gatewayReferenceId" VARCHAR\(128\) NOT NULL/u);
  assert.match(sql, /CONSTRAINT "Refund_gatewayReferenceId_key" UNIQUE \("gatewayReferenceId"\)/u);
  assert.match(sql, /CONSTRAINT "Refund_evidence_present" CHECK \(length\(btrim\("gatewayReferenceId"\)\) > 0\)/u);
  assert.match(sql, /CONSTRAINT "Refund_amount_positive" CHECK \("amount" > 0\)/u);
  // The command is exactly-once: the hashed key is the claim and the fingerprint
  // detects a changed payload under the same key.
  assert.match(sql, /CONSTRAINT "Refund_idempotencyKey_key" UNIQUE \("idempotencyKey"\)/u);
  assert.match(sql, /"idempotencyFingerprint" CHAR\(64\) NOT NULL/u);
  // Evidence is never deleted with the payment or the actor.
  assert.match(
    sql,
    /ADD CONSTRAINT "Refund_paymentId_fkey"\s*FOREIGN KEY \("paymentId"\) REFERENCES "Payment"\("id"\) ON DELETE RESTRICT/u,
  );
  assert.match(
    sql,
    /ADD CONSTRAINT "Refund_actorId_fkey"\s*FOREIGN KEY \("actorId"\) REFERENCES "User"\("id"\) ON DELETE SET NULL/u,
  );
});

test("refund total consistency migration refuses a running total that no refund row explains", async () => {
  const sql = await readFile(consistencyMigrationUrl, "utf8");

  // The running total is denormalized, so the database itself has to refuse a
  // total that does not match the recorded refunds. The check is deferred to
  // commit, because the service writes the row and the total together.
  assert.match(sql, /CREATE OR REPLACE FUNCTION refund_total_matches_payment\(\) RETURNS trigger/u);
  assert.match(sql, /FROM "Refund" WHERE "paymentId" = target_payment_id/u);
  assert.match(sql, /USING ERRCODE = 'check_violation'/u);
  assert.match(
    sql,
    /CREATE CONSTRAINT TRIGGER refund_total_consistency\s*AFTER INSERT OR UPDATE OR DELETE ON "Refund"\s*DEFERRABLE INITIALLY DEFERRED\s*FOR EACH ROW EXECUTE FUNCTION refund_total_matches_payment\(\)/u,
  );
  assert.match(
    sql,
    /CREATE CONSTRAINT TRIGGER payment_refunded_total_consistency\s*AFTER UPDATE OF "refundedAmount" ON "Payment"\s*DEFERRABLE INITIALLY DEFERRED\s*FOR EACH ROW EXECUTE FUNCTION refund_total_matches_payment\(\)/u,
  );
});
