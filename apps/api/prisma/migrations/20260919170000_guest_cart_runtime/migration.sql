-- Guest carts use a random browser token whose SHA-256 digest is the only
-- persisted credential. A cart has exactly one owner: customer or guest.
ALTER TABLE "Cart"
  ALTER COLUMN "customerId" DROP NOT NULL,
  ADD COLUMN "guestTokenHash" CHAR(64),
  ADD COLUMN "guestExpiresAt" TIMESTAMP(3),
  ADD CONSTRAINT "Cart_owner_exclusive" CHECK (
    ("customerId" IS NOT NULL AND "guestTokenHash" IS NULL AND "guestExpiresAt" IS NULL)
    OR
    ("customerId" IS NULL AND "guestTokenHash" IS NOT NULL AND "guestExpiresAt" IS NOT NULL)
  ),
  ADD CONSTRAINT "Cart_guest_token_hash_shape" CHECK (
    "guestTokenHash" IS NULL OR "guestTokenHash" ~ '^[0-9a-f]{64}$'
  ),
  ADD CONSTRAINT "Cart_guest_expiry_after_creation" CHECK (
    "guestExpiresAt" IS NULL OR "guestExpiresAt" > "createdAt"
  );

CREATE UNIQUE INDEX "Cart_guestTokenHash_key" ON "Cart"("guestTokenHash");
CREATE INDEX "Cart_guestExpiresAt_idx" ON "Cart"("guestExpiresAt");

CREATE TABLE "GuestCartMutation" (
  "id" TEXT NOT NULL,
  "cartId" TEXT NOT NULL,
  "scope" VARCHAR(100) NOT NULL,
  "keyHash" CHAR(64) NOT NULL,
  "fingerprint" VARCHAR(64) NOT NULL,
  "responseJson" JSONB NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "GuestCartMutation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GuestCartMutation_scope_nonempty" CHECK (btrim("scope") <> ''),
  CONSTRAINT "GuestCartMutation_key_hash_shape" CHECK ("keyHash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "GuestCartMutation_fingerprint_shape" CHECK ("fingerprint" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "GuestCartMutation_expiry_after_creation" CHECK ("expiresAt" > "createdAt"),
  CONSTRAINT "GuestCartMutation_cartId_fkey" FOREIGN KEY ("cartId") REFERENCES "Cart"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "GuestCartMutation_cartId_scope_keyHash_key"
  ON "GuestCartMutation"("cartId", "scope", "keyHash");
CREATE INDEX "GuestCartMutation_expiresAt_idx" ON "GuestCartMutation"("expiresAt");
