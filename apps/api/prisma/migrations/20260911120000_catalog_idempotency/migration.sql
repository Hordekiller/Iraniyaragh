CREATE TABLE "CatalogIdempotencyRecord" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "scope" VARCHAR(160) NOT NULL,
    "keyHash" CHAR(64) NOT NULL,
    "payloadHash" CHAR(64) NOT NULL,
    "response" JSONB,
    "resourceType" VARCHAR(100),
    "resourceId" VARCHAR(128),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogIdempotencyRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CatalogIdempotencyRecord_actorId_scope_keyHash_key"
ON "CatalogIdempotencyRecord"("actorId", "scope", "keyHash");

CREATE INDEX "CatalogIdempotencyRecord_expiresAt_idx"
ON "CatalogIdempotencyRecord"("expiresAt");

ALTER TABLE "CatalogIdempotencyRecord"
ADD CONSTRAINT "CatalogIdempotencyRecord_actorId_fkey"
FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
