-- CreateTable
CREATE TABLE "CreditSaleReturn" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "kind" VARCHAR(10) NOT NULL,
    "amount" BIGINT NOT NULL,
    "debtCredit" BIGINT NOT NULL,
    "refundDue" BIGINT NOT NULL,
    "entryId" TEXT,
    "evidenceReference" VARCHAR(128) NOT NULL,
    "evidenceHash" CHAR(64) NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "actorId" TEXT NOT NULL,
    "requestId" VARCHAR(100) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditSaleReturn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditSaleReturnLine" (
    "id" TEXT NOT NULL,
    "returnId" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" BIGINT NOT NULL,
    "movementId" TEXT NOT NULL,

    CONSTRAINT "CreditSaleReturnLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditRefundPayout" (
    "id" TEXT NOT NULL,
    "returnId" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "method" "CreditReceiptMethod" NOT NULL,
    "evidenceReference" VARCHAR(128) NOT NULL,
    "evidenceHash" CHAR(64) NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "actorId" TEXT NOT NULL,
    "requestId" VARCHAR(100) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditRefundPayout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CreditSaleReturn_entryId_key" ON "CreditSaleReturn"("entryId");

-- CreateIndex
CREATE UNIQUE INDEX "CreditSaleReturn_evidenceHash_key" ON "CreditSaleReturn"("evidenceHash");

-- CreateIndex
CREATE INDEX "CreditSaleReturn_orderId_createdAt_idx" ON "CreditSaleReturn"("orderId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CreditSaleReturnLine_movementId_key" ON "CreditSaleReturnLine"("movementId");

-- CreateIndex
CREATE INDEX "CreditSaleReturnLine_orderItemId_idx" ON "CreditSaleReturnLine"("orderItemId");

-- CreateIndex
CREATE UNIQUE INDEX "CreditRefundPayout_evidenceHash_key" ON "CreditRefundPayout"("evidenceHash");

-- CreateIndex
CREATE INDEX "CreditRefundPayout_returnId_idx" ON "CreditRefundPayout"("returnId");

-- AddForeignKey
ALTER TABLE "CreditSaleReturn" ADD CONSTRAINT "CreditSaleReturn_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditSaleReturn" ADD CONSTRAINT "CreditSaleReturn_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "ReceivableDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditSaleReturn" ADD CONSTRAINT "CreditSaleReturn_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "CreditLedgerEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditSaleReturn" ADD CONSTRAINT "CreditSaleReturn_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditSaleReturnLine" ADD CONSTRAINT "CreditSaleReturnLine_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "CreditSaleReturn"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditSaleReturnLine" ADD CONSTRAINT "CreditSaleReturnLine_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditSaleReturnLine" ADD CONSTRAINT "CreditSaleReturnLine_movementId_fkey" FOREIGN KEY ("movementId") REFERENCES "InventoryMovement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditRefundPayout" ADD CONSTRAINT "CreditRefundPayout_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "CreditSaleReturn"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditRefundPayout" ADD CONSTRAINT "CreditRefundPayout_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- These are new immutable evidence tables; no existing financial history is rewritten.
ALTER TABLE "CreditSaleReturn" ADD CONSTRAINT "CreditSaleReturn_bounds" CHECK (
 "kind" IN ('CANCEL','RETURN') AND "amount" > 0 AND "debtCredit" >= 0 AND "refundDue" >= 0
 AND "debtCredit"::numeric + "refundDue"::numeric = "amount"::numeric
 AND (("debtCredit" = 0 AND "entryId" IS NULL) OR ("debtCredit" > 0 AND "entryId" IS NOT NULL))
 AND length(btrim("evidenceReference")) > 0 AND length(btrim("reason")) > 0 AND length(btrim("requestId")) > 0);
ALTER TABLE "CreditSaleReturnLine" ADD CONSTRAINT "CreditSaleReturnLine_bounds" CHECK ("quantity" > 0 AND "unitPrice" > 0);
ALTER TABLE "CreditRefundPayout" ADD CONSTRAINT "CreditRefundPayout_bounds" CHECK ("amount" > 0
 AND length(btrim("evidenceReference")) > 0 AND length(btrim("reason")) > 0 AND length(btrim("requestId")) > 0);
CREATE TRIGGER "CreditSaleReturn_immutable" BEFORE UPDATE OR DELETE ON "CreditSaleReturn" FOR EACH ROW EXECUTE FUNCTION "credit_financial_immutable"();
CREATE TRIGGER "CreditSaleReturnLine_immutable" BEFORE UPDATE OR DELETE ON "CreditSaleReturnLine" FOR EACH ROW EXECUTE FUNCTION "credit_financial_immutable"();
CREATE TRIGGER "CreditRefundPayout_immutable" BEFORE UPDATE OR DELETE ON "CreditRefundPayout" FOR EACH ROW EXECUTE FUNCTION "credit_financial_immutable"();

CREATE FUNCTION "credit_return_stock_immutable"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS (SELECT 1 FROM "CreditSaleReturnLine" WHERE "movementId" = OLD."id") THEN
  RAISE EXCEPTION 'Returned stock evidence is immutable' USING ERRCODE = '23514';
 END IF;
 RETURN OLD;
END;
$$;
CREATE TRIGGER "InventoryMovement_credit_return_immutable" BEFORE UPDATE OR DELETE ON "InventoryMovement" FOR EACH ROW EXECUTE FUNCTION "credit_return_stock_immutable"();

CREATE FUNCTION "credit_return_receipt_reversal"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."kind" = 'RECEIPT_REVERSAL' AND EXISTS (
  SELECT 1 FROM "CreditSaleReturn" WHERE "documentId" = NEW."documentId" AND "refundDue" > 0
 ) THEN
  RAISE EXCEPTION 'Reconcile customer refund liability before receipt reversal' USING ERRCODE = '23514';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER "CreditLedgerEntry_return_reversal" BEFORE INSERT ON "CreditLedgerEntry" FOR EACH ROW EXECUTE FUNCTION "credit_return_receipt_reversal"();

CREATE FUNCTION "credit_return_reconcile"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target TEXT; o "Order"; d "ReceivableDocument"; balance NUMERIC; gross NUMERIC; paid NUMERIC;
BEGIN
 IF TG_TABLE_NAME = 'Order' THEN target := NEW."id";
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
 (gross > 0 AND EXISTS (SELECT 1 FROM "CreditLedgerEntry" e WHERE e."documentId" = d."id" AND
 (e."kind" = 'DEBIT_ADJUSTMENT' OR (e."kind" = 'CREDIT_NOTE' AND NOT EXISTS (SELECT 1 FROM "CreditSaleReturn" WHERE "entryId" = e."id"))))) OR
 (o."status" IN ('CANCELLED','RETURNED') AND (gross <> o."grandTotal" OR balance <> 0 OR NOT EXISTS (
 SELECT 1 FROM "Fulfillment" WHERE "orderId" = target AND "status"::text = o."status"::text))) OR
 (o."status" = 'CREDIT_APPROVED' AND gross = o."grandTotal") THEN
  RAISE EXCEPTION 'Credit return goods/debt/refund evidence does not reconcile' USING ERRCODE = '23514';
 END IF;
 RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER "Order_return_reconcile" AFTER INSERT OR UPDATE ON "Order" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "credit_return_reconcile"();
CREATE CONSTRAINT TRIGGER "CreditSaleReturn_reconcile" AFTER INSERT ON "CreditSaleReturn" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "credit_return_reconcile"();
CREATE CONSTRAINT TRIGGER "CreditSaleReturnLine_reconcile" AFTER INSERT ON "CreditSaleReturnLine" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "credit_return_reconcile"();
CREATE CONSTRAINT TRIGGER "CreditRefundPayout_reconcile" AFTER INSERT ON "CreditRefundPayout" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "credit_return_reconcile"();
CREATE CONSTRAINT TRIGGER "CreditLedgerEntry_return_reconcile" AFTER INSERT ON "CreditLedgerEntry" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "credit_return_reconcile"();
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
      WHERE o."id" = target AND o."status" IN ('CREDIT_APPROVED','CANCELLED','RETURNED') AND d."kind" = 'SALE'
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


CREATE OR REPLACE FUNCTION "payment_credit_order_lock"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM "id" FROM "Order" WHERE "id" = NEW."orderId" FOR UPDATE;
 IF EXISTS (SELECT 1 FROM "ReceivableDocument" WHERE "orderId" = NEW."orderId" AND "kind" = 'SALE') THEN
  RAISE EXCEPTION 'Gateway attempts cannot attach to a credit sale' USING ERRCODE = '23514';
 END IF;
 RETURN NEW;
END;
$$;
