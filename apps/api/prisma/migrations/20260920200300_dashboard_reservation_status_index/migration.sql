-- Keep exactly one statement; see 20260920200000_dashboard_summary_indexes.
CREATE INDEX CONCURRENTLY "StockReservation_status_idx" ON "StockReservation"("status");
