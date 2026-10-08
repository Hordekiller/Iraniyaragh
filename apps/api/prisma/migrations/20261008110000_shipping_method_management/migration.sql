ALTER TABLE "ShippingMethod" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ShippingMethod" ADD CONSTRAINT "ShippingMethod_version_nonnegative" CHECK ("version" >= 0);

CREATE TABLE "ShippingMethodMutation" (
  "id" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "code" VARCHAR(64) NOT NULL,
  "keyHash" CHAR(64) NOT NULL,
  "payloadHash" CHAR(64) NOT NULL,
  "response" JSONB NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ShippingMethodMutation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ShippingMethodMutation_actorId_code_keyHash_key" ON "ShippingMethodMutation"("actorId", "code", "keyHash");
CREATE INDEX "ShippingMethodMutation_expiresAt_idx" ON "ShippingMethodMutation"("expiresAt");
