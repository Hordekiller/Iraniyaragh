-- Payment initiation foundation (Epic-6): durable correlation, payload
-- fingerprint and gateway-environment evidence for every attempt.

ALTER TABLE "Payment"
  ADD COLUMN "idempotencyFingerprint" CHAR(64) NOT NULL DEFAULT '',
  ADD COLUMN "correlationId" VARCHAR(128),
  ADD COLUMN "gatewayEnvironment" VARCHAR(20) NOT NULL DEFAULT 'sandbox';

-- The service always writes a full SHA-256 hex fingerprint; the default only
-- exists so the NOT NULL column can be added to an empty table without data loss.
ALTER TABLE "Payment"
  ADD CONSTRAINT "Payment_idempotency_fingerprint_shape"
    CHECK (length("idempotencyFingerprint") = 64);

ALTER TABLE "Payment"
  ADD CONSTRAINT "Payment_correlation_id_shape"
    CHECK ("correlationId" IS NULL OR (length("correlationId") >= 1 AND length("correlationId") <= 128));

ALTER TABLE "Payment"
  ADD CONSTRAINT "Payment_gateway_environment_valid"
    CHECK ("gatewayEnvironment" IN ('sandbox', 'live'));