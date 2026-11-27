CREATE INDEX "Brand_imageAssetId_idx" ON "Brand"("imageAssetId");
CREATE INDEX "Category_imageAssetId_idx" ON "Category"("imageAssetId");
CREATE INDEX "Product_status_categoryId_createdAt_id_idx" ON "Product"("status", "categoryId", "createdAt", "id");
CREATE INDEX "Product_status_brandId_createdAt_id_idx" ON "Product"("status", "brandId", "createdAt", "id");
CREATE INDEX "ProductMedia_assetScope_createdAt_id_idx" ON "ProductMedia"("assetScope", "createdAt", "id");
CREATE INDEX "ProductVariant_productId_status_salePrice_id_idx" ON "ProductVariant"("productId", "status", "salePrice", "id");
CREATE INDEX "VariantPriceRecord_variantId_effectiveAt_createdAt_id_idx" ON "VariantPriceRecord"("variantId", "effectiveAt" DESC, "createdAt" DESC, "id" DESC);
