-- Keep exactly one statement in this migration: Prisma runs a multi-statement
-- PostgreSQL migration transactionally, while CONCURRENTLY must run outside a
-- transaction so writes remain available during index construction.
CREATE INDEX CONCURRENTLY "Order_createdAt_idx" ON "Order"("createdAt");
