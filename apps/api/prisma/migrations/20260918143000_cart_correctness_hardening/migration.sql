-- Preserve unexpired legacy replay records while moving all new Cart mutations to
-- operation-scoped, hashed idempotency identities with an explicit 24-hour TTL.
ALTER TABLE "CartMutation"
  ADD COLUMN "scope" VARCHAR(100),
  ADD COLUMN "keyHash" CHAR(64),
  ADD COLUMN "expiresAt" TIMESTAMP(3);

UPDATE "CartMutation"
SET
  "scope" = 'legacy',
  "expiresAt" = "createdAt" + INTERVAL '24 hours';

-- These records are replay caches, not business history. Once their documented
-- replay window has elapsed they can no longer authorize a replay.
DELETE FROM "CartMutation"
WHERE "expiresAt" <= CURRENT_TIMESTAMP;

ALTER TABLE "CartMutation"
  ALTER COLUMN "scope" SET NOT NULL,
  ALTER COLUMN "expiresAt" SET NOT NULL,
  ALTER COLUMN "idempotencyKey" DROP NOT NULL,
  ALTER COLUMN "cartId" DROP NOT NULL,
  ADD CONSTRAINT "CartMutation_scope_nonempty" CHECK (btrim("scope") <> ''),
  ADD CONSTRAINT "CartMutation_identity_exclusive" CHECK (
    ("idempotencyKey" IS NULL) <> ("keyHash" IS NULL)
  ),
  ADD CONSTRAINT "CartMutation_key_hash_shape" CHECK (
    "keyHash" IS NULL OR "keyHash" ~ '^[0-9a-f]{64}$'
  ),
  ADD CONSTRAINT "CartMutation_expiry_after_creation" CHECK (
    "expiresAt" > "createdAt"
  );

CREATE UNIQUE INDEX "CartMutation_customerId_scope_keyHash_key"
  ON "CartMutation"("customerId", "scope", "keyHash");
CREATE INDEX "CartMutation_expiresAt_idx" ON "CartMutation"("expiresAt");
DROP INDEX "CartMutation_createdAt_idx";
