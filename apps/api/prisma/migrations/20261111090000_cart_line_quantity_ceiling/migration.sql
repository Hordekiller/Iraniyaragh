-- Customers may type a bulk quantity directly, so one cart line may now hold up
-- to 1000 units (previously 99). Widening only: every existing row still
-- satisfies the new bound. Stock is still enforced when checkout reserves it.
ALTER TABLE "CartItem" DROP CONSTRAINT "CartItem_quantity_range";
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_quantity_range" CHECK ("quantity" BETWEEN 1 AND 1000);
