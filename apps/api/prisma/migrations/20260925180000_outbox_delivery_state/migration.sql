ALTER TABLE "OutboxEvent"
  ADD COLUMN "deadLetteredAt" TIMESTAMP(3),
  ADD COLUMN "lastErrorCode" VARCHAR(100);

DROP INDEX "OutboxEvent_publishedAt_availableAt_idx";

CREATE INDEX "OutboxEvent_publishedAt_deadLetteredAt_availableAt_idx"
  ON "OutboxEvent"("publishedAt", "deadLetteredAt", "availableAt");
