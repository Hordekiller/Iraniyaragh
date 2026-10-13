-- Free promotional lines are valid original staff-sale terms. Quantity evidence
-- controls terminal compensation; gross alone cannot prove every item returned.
ALTER TABLE "CreditSaleReturn" DROP CONSTRAINT "CreditSaleReturn_bounds";
ALTER TABLE "CreditSaleReturnLine" DROP CONSTRAINT "CreditSaleReturnLine_bounds";
ALTER TABLE "CreditSaleReturn" ADD CONSTRAINT "CreditSaleReturn_bounds" CHECK (
 "kind" IN ('CANCEL','RETURN') AND "amount" >= 0 AND "debtCredit" >= 0 AND "refundDue" >= 0
 AND "debtCredit"::numeric + "refundDue"::numeric = "amount"::numeric
 AND (("debtCredit" = 0 AND "entryId" IS NULL) OR ("debtCredit" > 0 AND "entryId" IS NOT NULL))
 AND length(btrim("evidenceReference")) > 0 AND length(btrim("reason")) > 0 AND length(btrim("requestId")) > 0);
ALTER TABLE "CreditSaleReturnLine" ADD CONSTRAINT "CreditSaleReturnLine_bounds" CHECK ("quantity" > 0 AND "unitPrice" >= 0);

CREATE OR REPLACE FUNCTION "credit_return_reconcile"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target TEXT; o "Order"; d "ReceivableDocument"; balance NUMERIC; gross NUMERIC; paid NUMERIC;
BEGIN
 IF TG_TABLE_NAME = 'Fulfillment' THEN target := NEW."orderId";
 ELSIF TG_TABLE_NAME = 'Order' THEN target := NEW."id";
 ELSIF TG_TABLE_NAME = 'CreditSaleReturn' THEN target := NEW."orderId";
 ELSIF TG_TABLE_NAME = 'CreditLedgerEntry' THEN SELECT "orderId" INTO target FROM "ReceivableDocument" WHERE "id" = NEW."documentId";
 ELSE SELECT "orderId" INTO target FROM "CreditSaleReturn" WHERE "id" = NEW."returnId"; END IF;
 IF target IS NULL THEN RETURN NULL; END IF;
 SELECT * INTO o FROM "Order" WHERE "id" = target;
 SELECT * INTO d FROM "ReceivableDocument" WHERE "orderId" = target;
 IF d."id" IS NULL THEN RETURN NULL; END IF;
 SELECT COALESCE(SUM("amount"),0), COALESCE(-SUM("amount") FILTER (WHERE "kind" IN ('RECEIPT','RECEIPT_REVERSAL')),0)
 INTO balance,paid FROM "CreditLedgerEntry" WHERE "documentId" = d."id";
 SELECT COALESCE(SUM("amount"),0) INTO gross FROM "CreditSaleReturn" WHERE "orderId" = target;
 IF gross > o."grandTotal" OR
 EXISTS (SELECT 1 FROM "CreditSaleReturn" r WHERE r."orderId" = target AND (
   r."documentId" <> d."id" OR (r."debtCredit" > 0 AND NOT EXISTS (
     SELECT 1 FROM "CreditLedgerEntry" e WHERE e."id" = r."entryId" AND e."documentId" = d."id" AND e."accountId" = d."accountId"
     AND e."kind" = 'CREDIT_NOTE' AND e."amount"::numeric = -r."debtCredit"::numeric
     AND e."actorId" = r."actorId" AND e."requestId" = r."requestId"))
   OR NOT EXISTS (SELECT 1 FROM "CreditSaleReturnLine" WHERE "returnId" = r."id")
   OR r."amount"::numeric <> (SELECT SUM(l."unitPrice"::numeric * l."quantity") FROM "CreditSaleReturnLine" l WHERE l."returnId" = r."id")
   OR (r."refundDue" > 0 AND balance <> 0)
   OR (r."kind" = 'CANCEL' AND (o."status" <> 'CANCELLED' OR EXISTS (SELECT 1 FROM "Shipment" WHERE "orderId" = target)))
   OR (r."kind" = 'RETURN' AND NOT EXISTS (SELECT 1 FROM "Shipment" s JOIN "FulfillmentTransition" t ON t."fulfillmentId" = s."fulfillmentId" WHERE s."orderId" = target AND t."from" = 'SHIPPED' AND t."to" = 'DELIVERED' AND t."reason" LIKE 'STAFF_DELIVERY_PROOF:%'))
 )) OR
 EXISTS (SELECT 1 FROM "CreditSaleReturnLine" l JOIN "CreditSaleReturn" r ON r."id" = l."returnId"
 JOIN "OrderItem" i ON i."id" = l."orderItemId" JOIN "InventoryMovement" m ON m."id" = l."movementId"
 WHERE r."orderId" = target AND (i."orderId" <> target OR l."unitPrice" <> i."unitPrice" OR m."type" <> 'RETURN_IN'
 OR m."quantity" <> l."quantity" OR m."variantId" <> i."variantId" OR m."referenceType" <> 'credit-return' OR m."referenceId" <> r."id"
 OR (r."kind" = 'CANCEL' AND NOT EXISTS (SELECT 1 FROM "StockReservation" sr WHERE sr."orderId" = target AND sr."variantId" = m."variantId" AND sr."warehouseId" = m."warehouseId" AND sr."locationId" = m."locationId" AND sr."status" = 'CONSUMED')))) OR
 EXISTS (SELECT 1 FROM "OrderItem" i WHERE i."orderId" = target AND i."quantity" < (SELECT COALESCE(SUM(l."quantity"),0) FROM "CreditSaleReturnLine" l WHERE l."orderItemId" = i."id")) OR
 (SELECT COALESCE(SUM("refundDue"),0) FROM "CreditSaleReturn" WHERE "orderId" = target) > paid OR
 EXISTS (SELECT 1 FROM "CreditRefundPayout" p JOIN "CreditSaleReturn" r ON r."id" = p."returnId" WHERE r."orderId" = target AND (p."effectiveAt" < r."createdAt" OR p."effectiveAt" > clock_timestamp())) OR
 EXISTS (SELECT 1 FROM "CreditSaleReturn" r LEFT JOIN "CreditRefundPayout" p ON p."returnId" = r."id" WHERE r."orderId" = target GROUP BY r."id" HAVING COALESCE(SUM(p."amount"),0) > r."refundDue") OR
 (EXISTS (SELECT 1 FROM "CreditSaleReturn" WHERE "orderId" = target) AND EXISTS (SELECT 1 FROM "CreditLedgerEntry" e WHERE e."documentId" = d."id" AND
 (e."kind" = 'DEBIT_ADJUSTMENT' OR (e."kind" = 'CREDIT_NOTE' AND NOT EXISTS (SELECT 1 FROM "CreditSaleReturn" WHERE "entryId" = e."id"))))) OR
 (o."status" IN ('CANCELLED','RETURNED') AND (gross <> o."grandTotal" OR NOT (NOT EXISTS (SELECT 1 FROM "OrderItem" i WHERE i."orderId" = target AND i."quantity" <> (SELECT COALESCE(SUM(l."quantity"),0) FROM "CreditSaleReturnLine" l WHERE l."orderItemId" = i."id"))) OR balance <> 0 OR NOT EXISTS (
 SELECT 1 FROM "Fulfillment" WHERE "orderId" = target AND "status"::text = o."status"::text))) OR
 (o."status" = 'CREDIT_APPROVED' AND NOT EXISTS (SELECT 1 FROM "OrderItem" i WHERE i."orderId" = target AND i."quantity" <> (SELECT COALESCE(SUM(l."quantity"),0) FROM "CreditSaleReturnLine" l WHERE l."orderItemId" = i."id"))) THEN
  RAISE EXCEPTION 'Credit return goods/debt/refund evidence does not reconcile' USING ERRCODE = '23514';
 END IF;
 RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "Fulfillment_credit_return_reconcile" AFTER INSERT OR UPDATE ON "Fulfillment" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "credit_return_reconcile"();
