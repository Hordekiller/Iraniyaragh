ALTER TYPE "OutboxEffectKind" ADD VALUE 'CUSTOMER_SHIPMENT_DISPATCHED';
ALTER TYPE "OutboxEffectKind" ADD VALUE 'CUSTOMER_SHIPMENT_DELIVERED';

ALTER TABLE "OutboxEffect"
  ADD COLUMN "attemptCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastAttemptAt" TIMESTAMP(3),
  ADD COLUMN "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "lastResultCode" VARCHAR(64),
  ADD COLUMN "providerMessageId" VARCHAR(128);

CREATE INDEX "OutboxEffect_status_kind_nextAttemptAt_idx"
  ON "OutboxEffect"("status", "kind", "nextAttemptAt");

ALTER TABLE "OutboxEffect" ADD CONSTRAINT "OutboxEffect_attemptCount_nonnegative"
  CHECK ("attemptCount" >= 0);
