CREATE TABLE "SmsOperatorTestSend" (
  "keyHash" CHAR(64) NOT NULL,
  "configurationHash" CHAR(64) NOT NULL,
  "status" VARCHAR(32) NOT NULL DEFAULT 'unknown_result',
  "providerMessageId" VARCHAR(128),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SmsOperatorTestSend_pkey" PRIMARY KEY ("keyHash"),
  CONSTRAINT "SmsOperatorTestSend_status_check" CHECK ("status" IN ('accepted', 'rejected', 'rate_limited', 'unavailable', 'unknown_result')),
  CONSTRAINT "SmsOperatorTestSend_evidence_check" CHECK (
    ("status" = 'accepted' AND "providerMessageId" IS NOT NULL) OR
    ("status" <> 'accepted' AND "providerMessageId" IS NULL)
  )
);
CREATE INDEX "SmsOperatorTestSend_createdAt_idx" ON "SmsOperatorTestSend"("createdAt");
