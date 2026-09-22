-- CreateTable
CREATE TABLE "OrderCommandIdempotencyRecord" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "scope" VARCHAR(100) NOT NULL,
  "keyHash" CHAR(64) NOT NULL,
  "fingerprint" CHAR(64) NOT NULL,
  "responseJson" JSONB,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrderCommandIdempotencyRecord_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OrderCommandIdempotencyRecord_expiry" CHECK ("expiresAt" > "createdAt"),
  CONSTRAINT "OrderCommandIdempotencyRecord_scope_nonempty" CHECK (btrim("scope") <> ''),
  CONSTRAINT "OrderCommandIdempotencyRecord_key_hash_shape" CHECK (length("keyHash") = 64),
  CONSTRAINT "OrderCommandIdempotencyRecord_fingerprint_shape" CHECK (length("fingerprint") = 64)
);

-- CreateIndex
CREATE INDEX "OrderCommandIdempotencyRecord_expiresAt_idx" ON "OrderCommandIdempotencyRecord"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "OrderCommandIdempotencyRecord_orderId_scope_keyHash_key" ON "OrderCommandIdempotencyRecord"("orderId", "scope", "keyHash");

-- AddForeignKey
ALTER TABLE "OrderCommandIdempotencyRecord"
  ADD CONSTRAINT "OrderCommandIdempotencyRecord_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;