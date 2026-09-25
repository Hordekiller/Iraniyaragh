CREATE TYPE "OutboxEffectKind" AS ENUM (
  'CUSTOMER_ORDER_CREATED',
  'CUSTOMER_ORDER_CANCELLED',
  'CUSTOMER_ORDER_EXPIRED',
  'CUSTOMER_ORDER_PAID',
  'PAYMENT_RECONCILIATION',
  'PAYMENT_REFUND_REVIEW'
);

CREATE TYPE "OutboxEffectStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

ALTER TABLE "OutboxEvent"
  ADD COLUMN "consumedAt" TIMESTAMP(3),
  ADD COLUMN "processingDeadLetteredAt" TIMESTAMP(3),
  ADD COLUMN "lastProcessingErrorCode" VARCHAR(100);

CREATE TABLE "OutboxEffect" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "kind" "OutboxEffectKind" NOT NULL,
  "subjectId" VARCHAR(128) NOT NULL,
  "status" "OutboxEffectStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OutboxEffect_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OutboxEffect_eventId_key" ON "OutboxEffect"("eventId");
CREATE INDEX "OutboxEffect_status_kind_createdAt_idx" ON "OutboxEffect"("status", "kind", "createdAt");
CREATE INDEX "OutboxEffect_subjectId_createdAt_idx" ON "OutboxEffect"("subjectId", "createdAt");

ALTER TABLE "OutboxEffect" ADD CONSTRAINT "OutboxEffect_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "OutboxEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
