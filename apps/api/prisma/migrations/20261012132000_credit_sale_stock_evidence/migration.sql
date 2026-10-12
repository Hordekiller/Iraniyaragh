-- Strengthen the newly introduced credit sale proof without rewriting an applied migration.
CREATE OR REPLACE FUNCTION "credit_sale_order_reconcile"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target TEXT;
BEGIN
  IF TG_TABLE_NAME = 'Order' THEN target := NEW."id"; ELSE target := NEW."orderId"; END IF;
  IF target IS NULL THEN RETURN NULL; END IF;
  IF EXISTS (SELECT 1 FROM "Order" WHERE "id" = target AND "status" = 'CREDIT_APPROVED') OR
     EXISTS (SELECT 1 FROM "ReceivableDocument" WHERE "orderId" = target AND "kind" = 'SALE') THEN
    IF NOT EXISTS (
      SELECT 1 FROM "Order" o JOIN "ReceivableDocument" d ON d."orderId" = o."id"
      JOIN "CreditAccount" a ON a."id" = d."accountId"
      JOIN "CreditLedgerEntry" e ON e."documentId" = d."id" AND e."accountId" = a."id"
      WHERE o."id" = target AND o."status" = 'CREDIT_APPROVED' AND d."kind" = 'SALE'
        AND a."customerId" = o."customerId" AND d."amount" = o."grandTotal"
        AND e."kind" = 'SALE' AND e."amount" = d."amount" AND e."effectiveAt" = d."issuedAt"
        AND EXISTS (SELECT 1 FROM "StaffOrderCommandRecord" WHERE "orderId" = o."id")
        AND EXISTS (SELECT 1 FROM "OrderTransition" WHERE "orderId" = o."id" AND "from" = 'PENDING_PAYMENT' AND "to" = 'CREDIT_APPROVED')
        AND EXISTS (SELECT 1 FROM "Fulfillment" WHERE "orderId" = o."id")
        AND NOT EXISTS (SELECT 1 FROM "Payment" WHERE "orderId" = o."id")
        AND EXISTS (SELECT 1 FROM "StockReservation" WHERE "orderId" = o."id")
        AND NOT EXISTS (SELECT 1 FROM "StockReservation" WHERE "orderId" = o."id" AND "status" <> 'CONSUMED')
        AND o."subtotal" = (SELECT COALESCE(SUM(i."total"),0) FROM "OrderItem" i WHERE i."orderId" = o."id")
        AND NOT EXISTS (SELECT 1 FROM "OrderItem" i WHERE i."orderId" = o."id" AND i."total"::numeric <> i."unitPrice"::numeric * i."quantity")
        AND NOT EXISTS (
          SELECT 1 FROM
            (SELECT "variantId", SUM("quantity") AS quantity FROM "OrderItem" WHERE "orderId" = o."id" GROUP BY "variantId") i
          FULL JOIN
            (SELECT "variantId", SUM("quantity") AS quantity FROM "StockReservation" WHERE "orderId" = o."id" GROUP BY "variantId") r USING ("variantId")
          WHERE i.quantity IS DISTINCT FROM r.quantity
        )
        AND NOT EXISTS (
          SELECT 1 FROM
            (SELECT "variantId", SUM("quantity") AS quantity FROM "OrderItem" WHERE "orderId" = o."id" GROUP BY "variantId") i
          FULL JOIN
            (SELECT "variantId", -SUM("quantity") AS quantity FROM "InventoryMovement" WHERE "referenceType" = 'order' AND "referenceId" = o."id" AND "type" = 'SALE' GROUP BY "variantId") m USING ("variantId")
          WHERE i.quantity IS DISTINCT FROM m.quantity
        )
    ) THEN
      RAISE EXCEPTION 'Credit sale requires matching immutable debt, staff source, transition and stock evidence without payment' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "OrderItem_credit_reconcile" AFTER INSERT OR UPDATE ON "OrderItem" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "credit_sale_order_reconcile"();
CREATE CONSTRAINT TRIGGER "StockReservation_credit_reconcile" AFTER INSERT OR UPDATE ON "StockReservation" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "credit_sale_order_reconcile"();

-- Every payment writer locks the same parent row as credit approval, including
-- a SQL writer that does not participate in the application's advisory lock.
CREATE FUNCTION "payment_credit_order_lock"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE commercial_status "OrderStatus";
BEGIN
  SELECT "status" INTO commercial_status FROM "Order" WHERE "id" = NEW."orderId" FOR UPDATE;
  IF commercial_status = 'CREDIT_APPROVED' THEN
    RAISE EXCEPTION 'Payment attempts cannot be attached to an approved credit sale' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "Payment_credit_order_lock" BEFORE INSERT OR UPDATE ON "Payment" FOR EACH ROW EXECUTE FUNCTION "payment_credit_order_lock"();
