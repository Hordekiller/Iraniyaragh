-- Keep exactly one statement in this migration: Prisma runs a multi-statement
-- PostgreSQL migration transactionally, while CONCURRENTLY must run outside a
-- transaction so writes remain available during index construction.
CREATE INDEX CONCURRENTLY "StockReservation_orderId_status_idx"
ON "StockReservation"("orderId", "status");