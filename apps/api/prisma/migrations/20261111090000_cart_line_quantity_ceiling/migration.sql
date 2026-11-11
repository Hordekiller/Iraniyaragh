-- Customers may type any bulk quantity directly; there is no business ceiling
-- (previously 99). The remaining bound only keeps unitPrice * quantity inside the
-- BIGINT money columns. Widening only: every existing row still satisfies it.
-- Stock is still enforced when checkout reserves it.
ALTER TABLE "CartItem" DROP CONSTRAINT "CartItem_quantity_range";
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_quantity_range" CHECK ("quantity" BETWEEN 1 AND 999999);
