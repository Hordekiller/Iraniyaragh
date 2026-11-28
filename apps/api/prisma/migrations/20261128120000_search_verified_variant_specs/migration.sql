-- Keep the previous applied migration immutable. Only verified, public variant
-- identifiers and physical dimensions are added to the transactional projection.
CREATE OR REPLACE FUNCTION refresh_product_search_v1(product_id text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
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
   (p.name,100),(p.slug,40),(v.sku,120),(v.barcode,115),(v.title,85),(b.name,65),
   ((SELECT string_agg(a.name,' ') FROM ancestors a),55),
   ((SELECT string_agg(a.name || ' ' || o.label,' ') FROM "ProductVariantAttributeValue" av JOIN "AttributeDefinition" a ON a.id=av."attributeId" JOIN "AttributeOption" o ON o.id=av."optionId" WHERE av."variantId"=v.id AND a.status='ACTIVE' AND o.status='ACTIVE'),75),
   (v."lengthCm"::text,60),(v."widthCm"::text,60),(v."heightCm"::text,60),(v."weightGrams"::text,50),
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

DO $$ DECLARE pid text; BEGIN
 FOR pid IN SELECT id FROM "Product" WHERE status='ACTIVE' ORDER BY id LOOP
   PERFORM refresh_product_search_v1(pid);
 END LOOP;
END $$;
