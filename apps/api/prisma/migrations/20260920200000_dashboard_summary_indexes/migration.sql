-- Dashboard summary queries use bounded range predicates and whole-table status
-- aggregates. Add leading-column indexes for every predicate/grouping that was
-- not covered by an existing primary, unique or composite-leading index.
CREATE INDEX "Order_createdAt_idx" ON "Order"("createdAt");
CREATE INDEX "Payment_status_idx" ON "Payment"("status");
CREATE INDEX "InventoryBalance_available_idx" ON "InventoryBalance"("available");
CREATE INDEX "StockReservation_status_idx" ON "StockReservation"("status");
CREATE INDEX "StockTransfer_status_idx" ON "StockTransfer"("status");
