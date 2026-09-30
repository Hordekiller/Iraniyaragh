-- Staff-created orders (#350).
-- Forward-only migration. Existing migrations are never edited.
--
-- Design notes:
--  * Staff orders reuse the existing Order, OrderItem, StockReservation,
--    OrderTransition and Fulfillment models. No parallel order model and no
--    simplified status column is introduced here.
--  * `version` carries optimistic concurrency for commands that act on an
--    existing order. Creation itself is guarded by the Idempotency-Key below,
--    because a create has no prior order version to compare against.
--  * `staffNote` is the counter/phone note the operator typed. It is kept on
--    the order rather than in the address snapshot so it can never be confused
--    with delivery data.
--  * Staff idempotency is keyed by the acting staff member, not by the
--    customer: a retry key belongs to whoever pressed the button, so the same
--    key submitted for two different customers must still be a single order.
--    CheckoutIdempotencyRecord cannot express that, because its uniqueness is
--    (customerId, scope, keyHash) and customer checkout legitimately reuses
--    keys across customers.

ALTER TABLE "Order"
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "staffNote" VARCHAR(500);

ALTER TABLE "Order" ADD CONSTRAINT "Order_version_nonnegative_check" CHECK ("version" >= 0);

CREATE TABLE "StaffOrderCommandRecord" (
  "id" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "scope" VARCHAR(100) NOT NULL,
  "keyHash" CHAR(64) NOT NULL,
  "payloadHash" CHAR(64) NOT NULL,
  "orderId" TEXT,
  "response" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StaffOrderCommandRecord_pkey" PRIMARY KEY ("id")
);

-- The whole point of this table: one key per (actor, scope) may produce at most
-- one order, whatever customer the payload names.
CREATE UNIQUE INDEX "StaffOrderCommandRecord_actorId_scope_keyHash_key"
  ON "StaffOrderCommandRecord"("actorId", "scope", "keyHash");
CREATE INDEX "StaffOrderCommandRecord_orderId_idx" ON "StaffOrderCommandRecord"("orderId");

ALTER TABLE "StaffOrderCommandRecord" ADD CONSTRAINT "StaffOrderCommandRecord_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StaffOrderCommandRecord" ADD CONSTRAINT "StaffOrderCommandRecord_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
