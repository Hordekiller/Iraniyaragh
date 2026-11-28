-- Multi-row catalog imports must refresh each affected product once, not once
-- per variant row (which made a 102-variant cart fixture quadratic).
DROP TRIGGER search_variant_insert_delete ON "ProductVariant";
DROP TRIGGER search_variant_indexed_update ON "ProductVariant";

CREATE FUNCTION sync_search_variants_statement_v1() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE pid text;
BEGIN
 IF TG_OP = 'INSERT' THEN
   FOR pid IN SELECT DISTINCT "productId" FROM new_rows ORDER BY "productId" LOOP
     PERFORM refresh_product_search_v1(pid);
   END LOOP;
 ELSIF TG_OP = 'DELETE' THEN
   FOR pid IN SELECT DISTINCT "productId" FROM old_rows ORDER BY "productId" LOOP
     PERFORM refresh_product_search_v1(pid);
   END LOOP;
 ELSE
   FOR pid IN
     SELECT DISTINCT affected."productId" FROM (
       SELECT n."productId" FROM new_rows n JOIN old_rows o ON o.id=n.id
       WHERE (n."productId",n.sku,n.barcode,n.title,n."weightGrams",n."lengthCm",n."widthCm",n."heightCm",n.status,n."isActive")
         IS DISTINCT FROM
             (o."productId",o.sku,o.barcode,o.title,o."weightGrams",o."lengthCm",o."widthCm",o."heightCm",o.status,o."isActive")
       UNION ALL
       SELECT o."productId" FROM new_rows n JOIN old_rows o ON o.id=n.id
       WHERE (n."productId",n.sku,n.barcode,n.title,n."weightGrams",n."lengthCm",n."widthCm",n."heightCm",n.status,n."isActive")
         IS DISTINCT FROM
             (o."productId",o.sku,o.barcode,o.title,o."weightGrams",o."lengthCm",o."widthCm",o."heightCm",o.status,o."isActive")
     ) affected ORDER BY affected."productId"
   LOOP
     PERFORM refresh_product_search_v1(pid);
   END LOOP;
 END IF;
 RETURN NULL;
END $$;

CREATE TRIGGER search_variant_insert_statement AFTER INSERT ON "ProductVariant"
REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION sync_search_variants_statement_v1();
CREATE TRIGGER search_variant_update_statement AFTER UPDATE ON "ProductVariant"
REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION sync_search_variants_statement_v1();
CREATE TRIGGER search_variant_delete_statement AFTER DELETE ON "ProductVariant"
REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION sync_search_variants_statement_v1();
