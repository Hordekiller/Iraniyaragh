-- CreateEnum
CREATE TYPE "PromotionKind" AS ENUM ('PERCENTAGE', 'FIXED_CART', 'FIXED_ITEM', 'FREE_SHIPPING');

-- CreateEnum
CREATE TYPE "PromotionMode" AS ENUM ('COUPON', 'AUTOMATIC');

-- CreateEnum
CREATE TYPE "PromotionTargetType" AS ENUM ('PRODUCT', 'VARIANT', 'CATEGORY', 'BRAND');

-- CreateEnum
CREATE TYPE "PromotionRedemptionStatus" AS ENUM ('RESERVED', 'CONFIRMED', 'RELEASED', 'REFUNDED');

-- AlterTable
ALTER TABLE "ShippingQuote" ADD COLUMN     "promotionDiscount" BIGINT NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Promotion" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "description" VARCHAR(500),
    "badgeText" VARCHAR(40),
    "kind" "PromotionKind" NOT NULL,
    "mode" "PromotionMode" NOT NULL,
    "percentBp" INTEGER,
    "amount" BIGINT,
    "maxDiscount" BIGINT,
    "minOrder" BIGINT,
    "maxOrder" BIGINT,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "maxRedemptions" INTEGER,
    "perCustomerLimit" INTEGER,
    "firstPurchaseOnly" BOOLEAN NOT NULL DEFAULT false,
    "customerId" TEXT,
    "stackable" BOOLEAN NOT NULL DEFAULT false,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Promotion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromotionTarget" (
    "id" TEXT NOT NULL,
    "promotionId" TEXT NOT NULL,
    "type" "PromotionTargetType" NOT NULL,
    "targetId" VARCHAR(64) NOT NULL,
    "exclude" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "PromotionTarget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Coupon" (
    "id" TEXT NOT NULL,
    "promotionId" TEXT NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "maxRedemptions" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "customerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Coupon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CartCouponIntent" (
    "cartId" TEXT NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CartCouponIntent_pkey" PRIMARY KEY ("cartId")
);

-- CreateTable
CREATE TABLE "PromotionRedemption" (
    "id" TEXT NOT NULL,
    "promotionId" TEXT NOT NULL,
    "couponId" TEXT,
    "orderId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "status" "PromotionRedemptionStatus" NOT NULL DEFAULT 'RESERVED',
    "discountAmount" BIGINT NOT NULL,
    "shippingDiscount" BIGINT NOT NULL DEFAULT 0,
    "refundedDiscount" BIGINT NOT NULL DEFAULT 0,
    "snapshot" JSONB NOT NULL,
    "releaseReason" VARCHAR(64),
    "reservedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),

    CONSTRAINT "PromotionRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Promotion_mode_isActive_startsAt_endsAt_idx" ON "Promotion"("mode", "isActive", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "Promotion_customerId_idx" ON "Promotion"("customerId");

-- CreateIndex
CREATE INDEX "PromotionTarget_type_targetId_idx" ON "PromotionTarget"("type", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "PromotionTarget_promotionId_type_targetId_exclude_key" ON "PromotionTarget"("promotionId", "type", "targetId", "exclude");

-- CreateIndex
CREATE UNIQUE INDEX "Coupon_code_key" ON "Coupon"("code");

-- CreateIndex
CREATE INDEX "Coupon_promotionId_idx" ON "Coupon"("promotionId");

-- CreateIndex
CREATE INDEX "Coupon_customerId_idx" ON "Coupon"("customerId");

-- CreateIndex
CREATE INDEX "PromotionRedemption_orderId_idx" ON "PromotionRedemption"("orderId");

-- CreateIndex
CREATE INDEX "PromotionRedemption_customerId_promotionId_status_idx" ON "PromotionRedemption"("customerId", "promotionId", "status");

-- CreateIndex
CREATE INDEX "PromotionRedemption_promotionId_status_idx" ON "PromotionRedemption"("promotionId", "status");

-- CreateIndex
CREATE INDEX "PromotionRedemption_couponId_status_idx" ON "PromotionRedemption"("couponId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PromotionRedemption_promotionId_orderId_key" ON "PromotionRedemption"("promotionId", "orderId");

-- AddForeignKey
ALTER TABLE "Promotion" ADD CONSTRAINT "Promotion_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Promotion" ADD CONSTRAINT "Promotion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionTarget" ADD CONSTRAINT "PromotionTarget_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "Promotion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "Promotion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartCouponIntent" ADD CONSTRAINT "CartCouponIntent_cartId_fkey" FOREIGN KEY ("cartId") REFERENCES "Cart"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionRedemption" ADD CONSTRAINT "PromotionRedemption_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "Promotion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionRedemption" ADD CONSTRAINT "PromotionRedemption_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionRedemption" ADD CONSTRAINT "PromotionRedemption_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionRedemption" ADD CONSTRAINT "PromotionRedemption_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Database-backed invariants: capacity can never be exceeded or go negative,
-- and money values stay in range even for writes that bypass the service.
ALTER TABLE "Promotion" ADD CONSTRAINT "Promotion_usedCount_within_limit" CHECK ("usedCount" >= 0 AND ("maxRedemptions" IS NULL OR "usedCount" <= "maxRedemptions"));
ALTER TABLE "Promotion" ADD CONSTRAINT "Promotion_values_valid" CHECK (
  ("percentBp" IS NULL OR ("percentBp" BETWEEN 1 AND 10000))
  AND ("amount" IS NULL OR "amount" > 0)
  AND ("maxDiscount" IS NULL OR "maxDiscount" > 0)
  AND ("minOrder" IS NULL OR "minOrder" >= 0)
  AND ("maxOrder" IS NULL OR "maxOrder" > 0)
  AND ("startsAt" IS NULL OR "endsAt" IS NULL OR "startsAt" < "endsAt"));
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_usedCount_within_limit" CHECK ("usedCount" >= 0 AND ("maxRedemptions" IS NULL OR "usedCount" <= "maxRedemptions"));
ALTER TABLE "PromotionRedemption" ADD CONSTRAINT "PromotionRedemption_amounts_valid" CHECK (
  "discountAmount" >= 0 AND "shippingDiscount" >= 0 AND "shippingDiscount" <= "discountAmount"
  AND "refundedDiscount" >= 0 AND "refundedDiscount" <= "discountAmount");
ALTER TABLE "ShippingQuote" ADD CONSTRAINT "ShippingQuote_promotionDiscount_nonnegative" CHECK ("promotionDiscount" >= 0);
