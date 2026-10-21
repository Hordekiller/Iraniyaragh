-- Presentation order of a product's attribute configurations.
--
-- The storefront renders a product's variant axes as a cascade of selectors
-- (brand, then weight, then mounting type, then opening angle). Without a
-- stored order the axes could only be ordered by an incidental column, which
-- made the selector order an implementation detail of the query rather than
-- something an operator controls.
--
-- This is presentation-only. The variant combination signature is a sha256
-- over the sorted set of "attributeId:optionId" pairs, so changing the order
-- of the axes never changes variant identity, SKU or any historical row.
ALTER TABLE "ProductAttributeConfiguration"
    ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "ProductAttributeConfiguration_productId_sortOrder_idx"
    ON "ProductAttributeConfiguration" ("productId", "sortOrder");
