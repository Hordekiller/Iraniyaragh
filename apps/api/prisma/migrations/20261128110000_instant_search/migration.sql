CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS fuzzystrmatch;

-- Versioned, shared by indexing and querying. Original catalog text is untouched.
CREATE FUNCTION search_normalize_v1(value text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
 SELECT trim(regexp_replace(regexp_replace(
   translate(lower(normalize(coalesce(value, ''), NFKC)),
     'يىكأإآؤئ۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩', 'ییکاااوی01234567890123456789'),
   '[ًٌٍَُِّْٰـ]', '', 'g'), '[^a-z0-9ء-ی]+', ' ', 'g'));
$$;
CREATE TABLE "SearchDocument" (
 id text PRIMARY KEY, "productId" text NOT NULL, title text NOT NULL,
 identifier text NOT NULL, "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "SearchDocument_productId_idx" ON "SearchDocument" ("productId");
CREATE INDEX "SearchDocument_identifier_idx" ON "SearchDocument" (identifier);
CREATE TABLE "SearchTerm" (
 "documentId" text NOT NULL REFERENCES "SearchDocument"(id) ON DELETE CASCADE,
 term varchar(100) NOT NULL, weight integer NOT NULL,
 PRIMARY KEY ("documentId", term)
);
CREATE INDEX "SearchTerm_prefix_idx" ON "SearchTerm" (term text_pattern_ops);
CREATE INDEX "SearchTerm_typo_idx" ON "SearchTerm" USING gin (term gin_trgm_ops);
CREATE INDEX "Product_search_title_idx" ON "Product" (search_normalize_v1(name) text_pattern_ops) WHERE status = 'ACTIVE';
CREATE TABLE "SearchAlias" (term text PRIMARY KEY, replacement text NOT NULL, "updatedAt" timestamptz NOT NULL DEFAULT now());
CREATE TABLE "SearchProductKeywords" ("productId" text PRIMARY KEY, keywords text NOT NULL DEFAULT '', boost integer NOT NULL DEFAULT 0 CHECK (boost BETWEEN 0 AND 10));
CREATE TABLE "SearchDailyMetric" (day date NOT NULL, query text NOT NULL, searches integer NOT NULL DEFAULT 0, "zeroResults" integer NOT NULL DEFAULT 0, clicks integer NOT NULL DEFAULT 0, PRIMARY KEY(day, query));
INSERT INTO "SearchAlias"(term,replacement) VALUES ('hinge','لولا'),('qrp','کیو ار پی');

CREATE FUNCTION refresh_product_search_v1(product_id text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 -- Serialize projection replacement with concurrent changes to the same product.
 PERFORM pg_advisory_xact_lock(hashtextextended('search:' || product_id, 0));
 DELETE FROM "SearchDocument" WHERE "productId" = product_id;
 INSERT INTO "SearchDocument"(id,"productId",title,identifier)
 SELECT v.id,p.id,search_normalize_v1(p.name),replace(search_normalize_v1(v.sku),' ','')
 FROM "Product" p JOIN "ProductVariant" v ON v."productId"=p.id
 WHERE p.id=product_id AND p.status='ACTIVE' AND v."isActive" AND v.status='ACTIVE';
 WITH RECURSIVE ancestors AS (
   SELECT c.id,c."parentId",c.name,1 AS depth FROM "Category" c JOIN "Product" p ON p."categoryId"=c.id WHERE p.id=product_id
   UNION ALL SELECT c.id,c."parentId",c.name,a.depth+1 FROM "Category" c JOIN ancestors a ON c.id=a."parentId" WHERE a.depth<20
 ), sources AS (
 SELECT d.id, x.value, x.weight FROM "SearchDocument" d
 JOIN "Product" p ON p.id=d."productId" JOIN "ProductVariant" v ON v.id=d.id
 LEFT JOIN "Brand" b ON b.id=p."brandId" LEFT JOIN "SearchProductKeywords" k ON k."productId"=p.id
 CROSS JOIN LATERAL (VALUES
   (p.name,100),(p.slug,40),(v.sku,120),(v.title,85),(b.name,65),
   ((SELECT string_agg(a.name,' ') FROM ancestors a),55),
   ((SELECT string_agg(a.name || ' ' || o.label,' ') FROM "ProductVariantAttributeValue" av JOIN "AttributeDefinition" a ON a.id=av."attributeId" JOIN "AttributeOption" o ON o.id=av."optionId" WHERE av."variantId"=v.id AND a.status='ACTIVE' AND o.status='ACTIVE'),75),
   (k.keywords,50),(left(regexp_replace(coalesce(p.description,''),'<[^>]*>',' ','g'),10000),10)
 ) x(value,weight) WHERE d."productId"=product_id
 ), words AS (
 SELECT id,weight,string_to_array(search_normalize_v1(value),' ') AS tokens FROM sources
 ), terms AS (
 SELECT id,weight,tokens[i] AS term FROM words CROSS JOIN LATERAL generate_subscripts(tokens,1) i
 UNION ALL
 SELECT id,weight-5,tokens[i] || tokens[i+1] FROM words CROSS JOIN LATERAL generate_subscripts(tokens,1) i WHERE i<array_length(tokens,1)
 ) INSERT INTO "SearchTerm"("documentId",term,weight)
 SELECT id,term,max(weight) FROM terms WHERE length(term) BETWEEN 1 AND 100 GROUP BY id,term;
END $$;

CREATE FUNCTION sync_catalog_search_v1() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE pid text; ref text;
BEGIN
 IF TG_TABLE_NAME='Product' THEN
   PERFORM refresh_product_search_v1(CASE WHEN TG_OP='DELETE' THEN OLD.id ELSE NEW.id END);
 ELSIF TG_TABLE_NAME IN ('ProductVariant','SearchProductKeywords') THEN
   pid := CASE WHEN TG_OP='DELETE' THEN OLD."productId" ELSE NEW."productId" END;
   PERFORM refresh_product_search_v1(pid);
   IF TG_OP='UPDATE' AND OLD."productId"<>NEW."productId" THEN PERFORM refresh_product_search_v1(OLD."productId"); END IF;
 ELSIF TG_TABLE_NAME='ProductVariantAttributeValue' THEN
   ref := CASE WHEN TG_OP='DELETE' THEN OLD."variantId" ELSE NEW."variantId" END;
   FOR pid IN SELECT "productId" FROM "ProductVariant" WHERE id=ref LOOP PERFORM refresh_product_search_v1(pid); END LOOP;
 ELSIF TG_TABLE_NAME='Brand' THEN
   ref := CASE WHEN TG_OP='DELETE' THEN OLD.id ELSE NEW.id END;
   FOR pid IN SELECT id FROM "Product" WHERE "brandId"=ref ORDER BY id LOOP PERFORM refresh_product_search_v1(pid); END LOOP;
 ELSIF TG_TABLE_NAME='Category' THEN
   ref := CASE WHEN TG_OP='DELETE' THEN OLD.id ELSE NEW.id END;
   FOR pid IN WITH RECURSIVE children AS (
     SELECT ref AS id UNION SELECT c.id FROM "Category" c JOIN children parent ON c."parentId"=parent.id
   ) SELECT p.id FROM "Product" p WHERE p."categoryId" IN (SELECT id FROM children) ORDER BY p.id
   LOOP PERFORM refresh_product_search_v1(pid); END LOOP;
 ELSE
   ref := CASE WHEN TG_OP='DELETE' THEN OLD.id ELSE NEW.id END;
   FOR pid IN SELECT DISTINCT v."productId" FROM "ProductVariant" v JOIN "ProductVariantAttributeValue" av ON av."variantId"=v.id
     WHERE (TG_TABLE_NAME='AttributeDefinition' AND av."attributeId"=ref) OR (TG_TABLE_NAME='AttributeOption' AND av."optionId"=ref) ORDER BY v."productId"
   LOOP PERFORM refresh_product_search_v1(pid); END LOOP;
 END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER search_product AFTER INSERT OR UPDATE OR DELETE ON "Product" FOR EACH ROW EXECUTE FUNCTION sync_catalog_search_v1();
CREATE TRIGGER search_variant AFTER INSERT OR UPDATE OR DELETE ON "ProductVariant" FOR EACH ROW EXECUTE FUNCTION sync_catalog_search_v1();
CREATE TRIGGER search_variant_attributes AFTER INSERT OR UPDATE OR DELETE ON "ProductVariantAttributeValue" FOR EACH ROW EXECUTE FUNCTION sync_catalog_search_v1();
CREATE TRIGGER search_brand AFTER UPDATE OR DELETE ON "Brand" FOR EACH ROW EXECUTE FUNCTION sync_catalog_search_v1();
CREATE TRIGGER search_category AFTER UPDATE OR DELETE ON "Category" FOR EACH ROW EXECUTE FUNCTION sync_catalog_search_v1();
CREATE TRIGGER search_attribute AFTER UPDATE OR DELETE ON "AttributeDefinition" FOR EACH ROW EXECUTE FUNCTION sync_catalog_search_v1();
CREATE TRIGGER search_option AFTER UPDATE OR DELETE ON "AttributeOption" FOR EACH ROW EXECUTE FUNCTION sync_catalog_search_v1();
CREATE TRIGGER search_keywords AFTER INSERT OR UPDATE OR DELETE ON "SearchProductKeywords" FOR EACH ROW EXECUTE FUNCTION sync_catalog_search_v1();
DO $$ DECLARE pid text; BEGIN FOR pid IN SELECT id FROM "Product" WHERE status='ACTIVE' ORDER BY id LOOP PERFORM refresh_product_search_v1(pid); END LOOP; END $$;
