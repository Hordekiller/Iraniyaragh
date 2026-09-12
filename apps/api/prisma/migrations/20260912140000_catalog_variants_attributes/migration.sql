-- CreateEnum
CREATE TYPE "VariantStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AttributeStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "VariantPriceSource" AS ENUM ('ADMIN', 'IMPORT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "CatalogImportStatus" AS ENUM ('UPLOADED', 'READY', 'COMMITTED', 'FAILED');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable: add variant columns nullable first so existing rows survive;
-- backfill and NOT NULL constraints follow in the data-migration section.
ALTER TABLE "ProductVariant"
    ADD COLUMN     "combinationSignature" TEXT,
    ADD COLUMN     "heightCm" INTEGER,
    ADD COLUMN     "lengthCm" INTEGER,
    ADD COLUMN     "skuKey" TEXT,
    ADD COLUMN     "status" "VariantStatus" NOT NULL DEFAULT 'ACTIVE',
    ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN     "widthCm" INTEGER;

-- Backfill VariantStatus from the legacy boolean; keep isActive in sync for
-- the expand/migrate/contract phase (ADR-0013).
UPDATE "ProductVariant"
SET "status" = CASE WHEN "isActive" THEN 'ACTIVE'::"VariantStatus" ELSE 'INACTIVE'::"VariantStatus" END;

-- Compute canonical skuKey. Canonicalization mirrors the application policy
-- (ADR-0013): Unicode NFC -> trim -> uppercase ASCII letters -> collapse runs of
-- internal whitespace. NFC is the identity for ASCII, so the migration first
-- fails loudly on any non-ASCII SKU instead of silently diverging from the
-- application normalizer.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "ProductVariant" WHERE "sku" ~ '[^[:ascii:]]') THEN
    RAISE EXCEPTION 'ProductVariant contains non-ASCII SKU; canonical skuKey backfill needs an explicit mapping (sample ids: %)',
      (SELECT string_agg(id, ',') FROM (SELECT id FROM "ProductVariant" WHERE "sku" ~ '[^[:ascii:]]' LIMIT 10) s);
  END IF;
END $$;

UPDATE "ProductVariant"
SET "skuKey" = UPPER(REGEXP_REPLACE(TRIM("sku"), '\s+', ' ', 'g'));

-- Preflight: the unique skuKey index may only be applied on verified data.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM (SELECT "skuKey", COUNT(*) AS c FROM "ProductVariant" GROUP BY "skuKey" HAVING COUNT(*) > 1) d) THEN
    RAISE EXCEPTION 'Duplicate canonical skuKey detected; resolve SKU collisions before applying the unique index';
  END IF;
END $$;

-- Backfill combinationSignature. During this migration no attribute values exist
-- yet, so every variant is attribute-less:
--  * exactly one variant per product -> the empty-combination signature
--    (sha256 of the empty set), fixed constant e3b0c442...;
--  * several attribute-less variants on one product -> 'legacy:' + variantId,
--    a reserved prefix that can never collide with a hex sha256 signature.
-- This preserves every existing variant id and SKU (ADR-0013 migration plan).
UPDATE "ProductVariant" v
SET "combinationSignature" = CASE
  WHEN (SELECT COUNT(*) FROM "ProductVariant" v2 WHERE v2."productId" = v."productId") = 1
    THEN 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
  ELSE 'legacy:' || v."id"
END;

-- Preflight: keep uniqueness per product; fail loudly instead of merging rows.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "ProductVariant" GROUP BY "productId", "combinationSignature" HAVING COUNT(*) > 1) THEN
    RAISE EXCEPTION 'Duplicate combinationSignature per product detected; resolve before applying the unique index';
  END IF;
END $$;

-- Verified; now enforce the invariants.
ALTER TABLE "ProductVariant" ALTER COLUMN "skuKey" SET NOT NULL;
ALTER TABLE "ProductVariant" ALTER COLUMN "combinationSignature" SET NOT NULL;

CREATE UNIQUE INDEX "ProductVariant_skuKey_key" ON "ProductVariant"("skuKey");
CREATE UNIQUE INDEX "ProductVariant_productId_combinationSignature_key" ON "ProductVariant"("productId", "combinationSignature");

-- CreateTable
CREATE TABLE "AttributeDefinition" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "AttributeStatus" NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttributeDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttributeOption" (
    "id" TEXT NOT NULL,
    "attributeId" TEXT NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "label" TEXT NOT NULL,
    "status" "AttributeStatus" NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttributeOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductAttributeConfiguration" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "attributeId" TEXT NOT NULL,
    "isVariantAxis" BOOLEAN NOT NULL DEFAULT false,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductAttributeConfiguration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductVariantAttributeValue" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "attributeId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductVariantAttributeValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VariantPriceRecord" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "costPrice" BIGINT NOT NULL,
    "salePrice" BIGINT NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" "VariantPriceSource" NOT NULL,
    "actorUserId" TEXT,
    "reason" TEXT,
    "requestId" VARCHAR(128),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VariantPriceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogImportRecord" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "version" VARCHAR(8) NOT NULL,
    "status" "CatalogImportStatus" NOT NULL,
    "requestId" VARCHAR(128),
    "idempotencyKeyHash" CHAR(64),
    "summary" JSONB,
    "issues" JSONB,
    "truncated" BOOLEAN NOT NULL DEFAULT false,
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogImportRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AttributeDefinition_code_key" ON "AttributeDefinition"("code");

-- CreateIndex
CREATE INDEX "AttributeDefinition_status_idx" ON "AttributeDefinition"("status");

-- CreateIndex
CREATE INDEX "AttributeOption_status_idx" ON "AttributeOption"("status");

-- CreateIndex
CREATE UNIQUE INDEX "AttributeOption_attributeId_code_key" ON "AttributeOption"("attributeId", "code");

-- CreateIndex
CREATE INDEX "ProductAttributeConfiguration_attributeId_idx" ON "ProductAttributeConfiguration"("attributeId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductAttributeConfiguration_productId_attributeId_key" ON "ProductAttributeConfiguration"("productId", "attributeId");

-- CreateIndex
CREATE INDEX "ProductVariantAttributeValue_attributeId_idx" ON "ProductVariantAttributeValue"("attributeId");

-- CreateIndex
CREATE INDEX "ProductVariantAttributeValue_optionId_idx" ON "ProductVariantAttributeValue"("optionId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductVariantAttributeValue_variantId_attributeId_key" ON "ProductVariantAttributeValue"("variantId", "attributeId");

-- CreateIndex
CREATE INDEX "VariantPriceRecord_variantId_effectiveAt_idx" ON "VariantPriceRecord"("variantId", "effectiveAt");

-- CreateIndex
CREATE INDEX "VariantPriceRecord_effectiveAt_idx" ON "VariantPriceRecord"("effectiveAt");

-- CreateIndex
CREATE INDEX "CatalogImportRecord_actorId_createdAt_idx" ON "CatalogImportRecord"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "CatalogImportRecord_expiresAt_idx" ON "CatalogImportRecord"("expiresAt");

-- AddForeignKey
ALTER TABLE "AttributeOption" ADD CONSTRAINT "AttributeOption_attributeId_fkey" FOREIGN KEY ("attributeId") REFERENCES "AttributeDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductAttributeConfiguration" ADD CONSTRAINT "ProductAttributeConfiguration_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductAttributeConfiguration" ADD CONSTRAINT "ProductAttributeConfiguration_attributeId_fkey" FOREIGN KEY ("attributeId") REFERENCES "AttributeDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariantAttributeValue" ADD CONSTRAINT "ProductVariantAttributeValue_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariantAttributeValue" ADD CONSTRAINT "ProductVariantAttributeValue_attributeId_fkey" FOREIGN KEY ("attributeId") REFERENCES "AttributeDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariantAttributeValue" ADD CONSTRAINT "ProductVariantAttributeValue_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "AttributeOption"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VariantPriceRecord" ADD CONSTRAINT "VariantPriceRecord_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VariantPriceRecord" ADD CONSTRAINT "VariantPriceRecord_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogImportRecord" ADD CONSTRAINT "CatalogImportRecord_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;