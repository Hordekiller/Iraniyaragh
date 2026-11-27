-- Existing product media remains product-owned. Storefront images reuse the same verified lifecycle.
ALTER TABLE "ProductMedia" ALTER COLUMN "productId" DROP NOT NULL;
ALTER TABLE "ProductMedia" ADD COLUMN "assetScope" VARCHAR(16) NOT NULL DEFAULT 'PRODUCT';
ALTER TABLE "ProductMedia" ADD CONSTRAINT "ProductMedia_scope_check" CHECK (
  ("assetScope" = 'PRODUCT' AND "productId" IS NOT NULL) OR
  ("assetScope" = 'STOREFRONT' AND "productId" IS NULL AND "kind" = 'IMAGE' AND "role" = 'GALLERY')
);
ALTER TABLE "Category" ADD COLUMN "imageAssetId" TEXT, ADD COLUMN "imageAlt" VARCHAR(200), ADD COLUMN "shopOrder" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "shopFeatured" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Brand" ADD COLUMN "imageAssetId" TEXT, ADD COLUMN "imageAlt" VARCHAR(200), ADD COLUMN "shopOrder" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "shopFeatured" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Category" ADD CONSTRAINT "Category_imageAssetId_fkey" FOREIGN KEY ("imageAssetId") REFERENCES "ProductMedia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Brand" ADD CONSTRAINT "Brand_imageAssetId_fkey" FOREIGN KEY ("imageAssetId") REFERENCES "ProductMedia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE TABLE "ShopConfig" ("id" VARCHAR(32) NOT NULL DEFAULT 'shop', "version" INTEGER NOT NULL DEFAULT 0, "content" JSONB NOT NULL DEFAULT '{}', "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "ShopConfig_pkey" PRIMARY KEY ("id"));
CREATE TABLE "ShopAssetReference" ("configId" VARCHAR(32) NOT NULL, "mediaId" TEXT NOT NULL, CONSTRAINT "ShopAssetReference_pkey" PRIMARY KEY ("configId", "mediaId"));
CREATE INDEX "ShopAssetReference_mediaId_idx" ON "ShopAssetReference"("mediaId");
ALTER TABLE "ShopAssetReference" ADD CONSTRAINT "ShopAssetReference_configId_fkey" FOREIGN KEY ("configId") REFERENCES "ShopConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShopAssetReference" ADD CONSTRAINT "ShopAssetReference_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "ProductMedia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE TABLE "WishlistItem" ("userId" TEXT NOT NULL, "productId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "WishlistItem_pkey" PRIMARY KEY ("userId", "productId"));
CREATE INDEX "WishlistItem_userId_createdAt_idx" ON "WishlistItem"("userId", "createdAt");
ALTER TABLE "WishlistItem" ADD CONSTRAINT "WishlistItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WishlistItem" ADD CONSTRAINT "WishlistItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
