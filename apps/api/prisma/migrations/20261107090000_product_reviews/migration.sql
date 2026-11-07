-- Verified-purchase product reviews with moderation, staff reply and idempotent commands.
CREATE TYPE "ProductReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'HIDDEN');

CREATE TABLE "ProductReview" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "title" VARCHAR(100),
    "body" VARCHAR(2000) NOT NULL,
    "status" "ProductReviewStatus" NOT NULL DEFAULT 'PENDING',
    "version" INTEGER NOT NULL DEFAULT 1,
    "moderationNote" VARCHAR(300),
    "moderatedById" TEXT,
    "moderatedAt" TIMESTAMP(3),
    "staffReply" VARCHAR(1000),
    "staffRepliedById" TEXT,
    "staffRepliedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProductReview_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ProductReview_productId_customerId_key" ON "ProductReview"("productId", "customerId");
CREATE INDEX "ProductReview_productId_status_publishedAt_id_idx" ON "ProductReview"("productId", "status", "publishedAt" DESC, "id");
CREATE INDEX "ProductReview_status_createdAt_idx" ON "ProductReview"("status", "createdAt");
CREATE INDEX "ProductReview_customerId_createdAt_idx" ON "ProductReview"("customerId", "createdAt");
ALTER TABLE "ProductReview" ADD CONSTRAINT "ProductReview_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProductReview" ADD CONSTRAINT "ProductReview_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProductReview" ADD CONSTRAINT "ProductReview_moderatedById_fkey" FOREIGN KEY ("moderatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProductReview" ADD CONSTRAINT "ProductReview_staffRepliedById_fkey" FOREIGN KEY ("staffRepliedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProductReview" ADD CONSTRAINT "ProductReview_rating_range" CHECK ("rating" BETWEEN 1 AND 5);
ALTER TABLE "ProductReview" ADD CONSTRAINT "ProductReview_version_positive" CHECK ("version" >= 1);
-- A public review always has a first-publication time.
ALTER TABLE "ProductReview" ADD CONSTRAINT "ProductReview_approved_has_time" CHECK ("status" <> 'APPROVED' OR "publishedAt" IS NOT NULL);

CREATE TABLE "ProductReviewCommand" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "keyHash" CHAR(64) NOT NULL,
    "payloadHash" CHAR(64) NOT NULL,
    "response" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductReviewCommand_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ProductReviewCommand_actorId_keyHash_key" ON "ProductReviewCommand"("actorId", "keyHash");
ALTER TABLE "ProductReviewCommand" ADD CONSTRAINT "ProductReviewCommand_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
