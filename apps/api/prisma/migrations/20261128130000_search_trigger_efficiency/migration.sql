-- Commerce price/version writes do not change search terms. Keep the
-- projection synchronized only when an indexed field or visibility changes.
DROP TRIGGER search_product ON "Product";
CREATE TRIGGER search_product_insert_delete AFTER INSERT OR DELETE ON "Product"
FOR EACH ROW EXECUTE FUNCTION sync_catalog_search_v1();
CREATE TRIGGER search_product_indexed_update
AFTER UPDATE OF name, slug, description, status, "brandId", "categoryId" ON "Product"
FOR EACH ROW EXECUTE FUNCTION sync_catalog_search_v1();

DROP TRIGGER search_variant ON "ProductVariant";
CREATE TRIGGER search_variant_insert_delete AFTER INSERT OR DELETE ON "ProductVariant"
FOR EACH ROW EXECUTE FUNCTION sync_catalog_search_v1();
CREATE TRIGGER search_variant_indexed_update
AFTER UPDATE OF "productId", sku, barcode, title, "weightGrams", "lengthCm", "widthCm", "heightCm", status, "isActive" ON "ProductVariant"
FOR EACH ROW EXECUTE FUNCTION sync_catalog_search_v1();
