-- Enforce the ASCII-only SKU invariant described by ADR-0013 and the canonical
-- skuKey backfill in 20260912140000. That migration rejected non-ASCII SKUs with
-- a one-time preflight; without a durable constraint, later code paths could
-- reintroduce non-ASCII SKUs while canonicalizeSku keeps folding only ASCII case,
-- silently diverging from the documented canonicalization policy.
-- Existing rows are guaranteed ASCII (the backfill raised otherwise), so the
-- constraints can only be violated by new rows.
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_sku_ascii_chk" CHECK ("sku" ~ '^[[:ascii:]]*$');
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_skuKey_ascii_chk" CHECK ("skuKey" ~ '^[[:ascii:]]*$');