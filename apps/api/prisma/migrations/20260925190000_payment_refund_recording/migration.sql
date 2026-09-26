-- Record refunds that staff performed in the gateway panel (ADR-0019).
--
-- Zarinpal v4 exposes no refund API, so this migration adds evidence for a
-- transfer the application never performs. The money invariant is enforced by
-- the database: the running refunded total can never exceed the captured amount,
-- even for writes that bypass the service.
CREATE TYPE "RefundStatus" AS ENUM ('RECORDED');

ALTER TABLE "Payment" ADD COLUMN "refundedAmount" BIGINT NOT NULL DEFAULT 0;

-- Existing rows carry refundedAmount = 0, so this holds for all of them.
ALTER TABLE "Payment"
  ADD CONSTRAINT "Payment_refundedAmount_within_amount"
  CHECK ("refundedAmount" >= 0 AND "refundedAmount" <= "amount");

CREATE TABLE "Refund" (
  "id" TEXT NOT NULL,
  "paymentId" TEXT NOT NULL,
  "amount" BIGINT NOT NULL,
  "status" "RefundStatus" NOT NULL DEFAULT 'RECORDED',
  "gatewayReferenceId" VARCHAR(128) NOT NULL,
  "reason" VARCHAR(255) NOT NULL,
  "note" VARCHAR(500),
  "idempotencyKey" CHAR(64) NOT NULL,
  "idempotencyFingerprint" CHAR(64) NOT NULL,
  "actorId" TEXT,
  "requestId" VARCHAR(100) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Refund_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Refund_gatewayReferenceId_key" UNIQUE ("gatewayReferenceId"),
  CONSTRAINT "Refund_idempotencyKey_key" UNIQUE ("idempotencyKey"),
  CONSTRAINT "Refund_amount_positive" CHECK ("amount" > 0),
  CONSTRAINT "Refund_evidence_present" CHECK (length(btrim("gatewayReferenceId")) > 0),
  CONSTRAINT "Refund_reason_present" CHECK (length(btrim("reason")) > 0)
);

CREATE INDEX "Refund_paymentId_createdAt_idx" ON "Refund"("paymentId", "createdAt");
CREATE INDEX "Refund_actorId_createdAt_idx" ON "Refund"("actorId", "createdAt");

ALTER TABLE "Refund"
  ADD CONSTRAINT "Refund_paymentId_fkey"
  FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Refund"
  ADD CONSTRAINT "Refund_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
