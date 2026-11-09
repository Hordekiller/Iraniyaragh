-- Customer returns against paid orders (policy `returns-v1`).
--
-- A return is an append-only record of goods received back. It never moves
-- money: the refund is executed by staff in the gateway panel and linked later
-- (OrderReturnRefund) through the existing manual refund evidence. The window,
-- the quantities and the refundable amount are enforced here as well as in the
-- service, so a write that bypasses the service cannot break them.
CREATE TYPE "ReturnWindowKind" AS ENUM ('IN_PERSON', 'DELIVERY');
CREATE TYPE "ReturnDisposition" AS ENUM ('RESTOCK', 'DAMAGED', 'NOT_RETURNED');

-- NULL means "not classified yet": returns of orders using this method stay
-- blocked until staff classify it. Nothing is inferred from the method's name.
ALTER TABLE "ShippingMethod" ADD COLUMN "returnWindowKind" "ReturnWindowKind";

CREATE TABLE "ReturnHoliday" (
  "id" TEXT NOT NULL,
  "dateKey" VARCHAR(10) NOT NULL,
  "label" VARCHAR(120) NOT NULL,
  "actorId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReturnHoliday_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ReturnHoliday_dateKey_format" CHECK ("dateKey" ~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'),
  CONSTRAINT "ReturnHoliday_label_present" CHECK (length(btrim("label")) > 0)
);
CREATE UNIQUE INDEX "ReturnHoliday_dateKey_key" ON "ReturnHoliday"("dateKey");
ALTER TABLE "ReturnHoliday"
  ADD CONSTRAINT "ReturnHoliday_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "OrderReturn" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "windowKind" "ReturnWindowKind" NOT NULL,
  "policyRevision" VARCHAR(32) NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "invoiceIssuedAt" TIMESTAMP(3) NOT NULL,
  "deadlineAt" TIMESTAMP(3) NOT NULL,
  "returnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "merchandiseRefund" BIGINT NOT NULL,
  "shippingRefund" BIGINT NOT NULL,
  "refundDue" BIGINT NOT NULL,
  "reason" VARCHAR(500) NOT NULL,
  "note" VARCHAR(500),
  "actorId" TEXT NOT NULL,
  "requestId" VARCHAR(100) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrderReturn_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OrderReturn_sequence_positive" CHECK ("sequence" > 0),
  CONSTRAINT "OrderReturn_amounts_valid" CHECK ("merchandiseRefund" >= 0 AND "shippingRefund" >= 0 AND "refundDue" = "merchandiseRefund" + "shippingRefund"),
  CONSTRAINT "OrderReturn_inside_window" CHECK ("returnedAt" >= "invoiceIssuedAt" AND "returnedAt" <= "deadlineAt"),
  CONSTRAINT "OrderReturn_reason_present" CHECK (length(btrim("reason")) > 0)
);
CREATE UNIQUE INDEX "OrderReturn_orderId_sequence_key" ON "OrderReturn"("orderId", "sequence");
CREATE INDEX "OrderReturn_orderId_createdAt_idx" ON "OrderReturn"("orderId", "createdAt");
CREATE INDEX "OrderReturn_createdAt_idx" ON "OrderReturn"("createdAt");
ALTER TABLE "OrderReturn" ADD CONSTRAINT "OrderReturn_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrderReturn" ADD CONSTRAINT "OrderReturn_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "InvoiceDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrderReturn" ADD CONSTRAINT "OrderReturn_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "OrderReturnLine" (
  "id" TEXT NOT NULL,
  "returnId" TEXT NOT NULL,
  "orderItemId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "disposition" "ReturnDisposition" NOT NULL,
  "unitPrice" BIGINT NOT NULL,
  "refundAmount" BIGINT NOT NULL,
  "movementId" TEXT,
  CONSTRAINT "OrderReturnLine_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OrderReturnLine_quantity_positive" CHECK ("quantity" > 0),
  CONSTRAINT "OrderReturnLine_amounts_valid" CHECK ("unitPrice" >= 0 AND "refundAmount" >= 0 AND "refundAmount" <= "unitPrice" * "quantity"),
  -- Only a restocked line has a stock movement; the others never touch stock.
  CONSTRAINT "OrderReturnLine_movement_matches_disposition" CHECK (("disposition" = 'RESTOCK') = ("movementId" IS NOT NULL))
);
CREATE UNIQUE INDEX "OrderReturnLine_movementId_key" ON "OrderReturnLine"("movementId");
CREATE UNIQUE INDEX "OrderReturnLine_returnId_orderItemId_key" ON "OrderReturnLine"("returnId", "orderItemId");
CREATE INDEX "OrderReturnLine_orderItemId_idx" ON "OrderReturnLine"("orderItemId");
ALTER TABLE "OrderReturnLine" ADD CONSTRAINT "OrderReturnLine_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "OrderReturn"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrderReturnLine" ADD CONSTRAINT "OrderReturnLine_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrderReturnLine" ADD CONSTRAINT "OrderReturnLine_movementId_fkey" FOREIGN KEY ("movementId") REFERENCES "InventoryMovement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "OrderReturnRefund" (
  "id" TEXT NOT NULL,
  "returnId" TEXT NOT NULL,
  "refundId" TEXT NOT NULL,
  "amount" BIGINT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrderReturnRefund_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OrderReturnRefund_amount_positive" CHECK ("amount" > 0)
);
CREATE UNIQUE INDEX "OrderReturnRefund_refundId_key" ON "OrderReturnRefund"("refundId");
CREATE INDEX "OrderReturnRefund_returnId_idx" ON "OrderReturnRefund"("returnId");
ALTER TABLE "OrderReturnRefund" ADD CONSTRAINT "OrderReturnRefund_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "OrderReturn"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrderReturnRefund" ADD CONSTRAINT "OrderReturnRefund_refundId_fkey" FOREIGN KEY ("refundId") REFERENCES "Refund"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Append-only evidence: returns are never edited or deleted.
-- ---------------------------------------------------------------------------
CREATE FUNCTION order_return_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Order return records are append-only' USING ERRCODE = '23514';
END;
$$;
CREATE TRIGGER order_return_immutable BEFORE UPDATE OR DELETE ON "OrderReturn" FOR EACH ROW EXECUTE FUNCTION order_return_immutable();
CREATE TRIGGER order_return_line_immutable BEFORE UPDATE OR DELETE ON "OrderReturnLine" FOR EACH ROW EXECUTE FUNCTION order_return_immutable();
CREATE TRIGGER order_return_refund_immutable BEFORE UPDATE OR DELETE ON "OrderReturnRefund" FOR EACH ROW EXECUTE FUNCTION order_return_immutable();

-- ---------------------------------------------------------------------------
-- A return needs a paid order, its own issued invoice, and no custom door.
-- ---------------------------------------------------------------------------
CREATE FUNCTION order_return_preconditions() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  order_status "OrderStatus";
  invoice_order text;
  invoice_issued timestamp(3);
BEGIN
  SELECT "status" INTO order_status FROM "Order" WHERE "id" = NEW."orderId" FOR UPDATE;
  IF order_status IS NULL OR order_status <> 'PAID' THEN
    RAISE EXCEPTION 'Only a paid order can receive a return' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (SELECT 1 FROM "DoorOrder" WHERE "id" = NEW."orderId") THEN
    RAISE EXCEPTION 'Custom door orders are excluded from returns' USING ERRCODE = '23514';
  END IF;
  SELECT "orderId", "issuedAt" INTO invoice_order, invoice_issued FROM "InvoiceDocument" WHERE "id" = NEW."invoiceId";
  IF invoice_order IS NULL OR invoice_order <> NEW."orderId" OR invoice_issued <> NEW."invoiceIssuedAt" THEN
    RAISE EXCEPTION 'A return must cite the order''s own issued invoice' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER order_return_preconditions BEFORE INSERT ON "OrderReturn" FOR EACH ROW EXECUTE FUNCTION order_return_preconditions();

-- ---------------------------------------------------------------------------
-- Cumulative returned quantity of an order line can never exceed what was sold.
-- The order line is locked, so two concurrent returns cannot both slip through.
-- ---------------------------------------------------------------------------
CREATE FUNCTION order_return_line_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  sold integer;
  item_order text;
  return_order text;
  already integer;
BEGIN
  SELECT "quantity", "orderId" INTO sold, item_order FROM "OrderItem" WHERE "id" = NEW."orderItemId" FOR UPDATE;
  SELECT "orderId" INTO return_order FROM "OrderReturn" WHERE "id" = NEW."returnId";
  IF sold IS NULL OR return_order IS NULL OR item_order <> return_order THEN
    RAISE EXCEPTION 'A return line must belong to an item of the same order' USING ERRCODE = '23514';
  END IF;
  SELECT COALESCE(SUM("quantity"), 0) INTO already FROM "OrderReturnLine" WHERE "orderItemId" = NEW."orderItemId";
  IF already + NEW."quantity" > sold THEN
    RAISE EXCEPTION 'Returned quantity % would exceed the % sold', already + NEW."quantity", sold USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER order_return_line_guard BEFORE INSERT ON "OrderReturnLine" FOR EACH ROW EXECUTE FUNCTION order_return_line_guard();

-- ---------------------------------------------------------------------------
-- Linked refunds can never exceed the refund the return is due, and must be
-- payments of the same order.
-- ---------------------------------------------------------------------------
CREATE FUNCTION order_return_refund_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  due bigint;
  return_order text;
  refund_order text;
  refund_amount bigint;
  linked bigint;
BEGIN
  SELECT "refundDue", "orderId" INTO due, return_order FROM "OrderReturn" WHERE "id" = NEW."returnId" FOR UPDATE;
  SELECT p."orderId", r."amount" INTO refund_order, refund_amount
    FROM "Refund" r JOIN "Payment" p ON p."id" = r."paymentId" WHERE r."id" = NEW."refundId";
  IF due IS NULL OR refund_order IS NULL OR refund_order <> return_order THEN
    RAISE EXCEPTION 'A return can only be settled by a refund of the same order' USING ERRCODE = '23514';
  END IF;
  IF refund_amount <> NEW."amount" THEN
    RAISE EXCEPTION 'The link amount must equal the recorded refund' USING ERRCODE = '23514';
  END IF;
  SELECT COALESCE(SUM("amount"), 0) INTO linked FROM "OrderReturnRefund" WHERE "returnId" = NEW."returnId";
  IF linked + NEW."amount" > due THEN
    RAISE EXCEPTION 'Linked refunds % would exceed the refund due %', linked + NEW."amount", due USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER order_return_refund_guard BEFORE INSERT ON "OrderReturnRefund" FOR EACH ROW EXECUTE FUNCTION order_return_refund_guard();

-- ---------------------------------------------------------------------------
-- Header totals must equal the lines (deferred so header and lines can be
-- inserted in one transaction in any order).
-- ---------------------------------------------------------------------------
CREATE FUNCTION order_return_totals_match() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  target text;
  lines_total numeric;
  line_count integer;
  header_total bigint;
BEGIN
  IF TG_TABLE_NAME = 'OrderReturn' THEN target := NEW."id"; ELSE target := NEW."returnId"; END IF;
  SELECT COALESCE(SUM("refundAmount"), 0), COUNT(*) INTO lines_total, line_count FROM "OrderReturnLine" WHERE "returnId" = target;
  SELECT "merchandiseRefund" INTO header_total FROM "OrderReturn" WHERE "id" = target;
  IF line_count = 0 OR lines_total <> header_total THEN
    RAISE EXCEPTION 'A return needs lines whose refunds equal its merchandise total' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER order_return_totals_header AFTER INSERT ON "OrderReturn" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION order_return_totals_match();
CREATE CONSTRAINT TRIGGER order_return_totals_lines AFTER INSERT ON "OrderReturnLine" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION order_return_totals_match();

-- ---------------------------------------------------------------------------
-- Canonical permissions on already-provisioned databases. Existing rows are
-- preserved; this never revives a deactivated or revoked grant.
-- ---------------------------------------------------------------------------
INSERT INTO "Permission" ("id", "key", "name", "description", "group", "isActive", "createdAt", "updatedAt")
VALUES
  ('migration_permission_returns_read', 'returns.read', 'Read order returns', 'Canonical returns.read permission.', 'returns', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('migration_permission_returns_manage', 'returns.manage', 'Record order returns', 'Canonical returns.manage permission.', 'returns', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
