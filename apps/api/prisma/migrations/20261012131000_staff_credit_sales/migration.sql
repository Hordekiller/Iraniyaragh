-- Additive, forward-only. Existing opening balances retain their original evidence.
ALTER TABLE "ReceivableDocument" ADD COLUMN "orderId" TEXT;
CREATE UNIQUE INDEX "ReceivableDocument_orderId_key" ON "ReceivableDocument"("orderId");
ALTER TABLE "ReceivableDocument" ADD CONSTRAINT "ReceivableDocument_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
DROP INDEX "ReceivableDocument_accountId_kind_key";
CREATE UNIQUE INDEX "ReceivableDocument_opening_once" ON "ReceivableDocument"("accountId") WHERE "kind" = 'OPENING_BALANCE';
ALTER TABLE "ReceivableDocument" ADD CONSTRAINT "ReceivableDocument_source_valid" CHECK (
  ("kind" = 'OPENING_BALANCE' AND "orderId" IS NULL) OR ("kind" = 'SALE' AND "orderId" IS NOT NULL)
);
CREATE UNIQUE INDEX "CreditLedgerEntry_sale_once" ON "CreditLedgerEntry"("documentId") WHERE "kind" = 'SALE';
ALTER TABLE "CreditLedgerEntry" DROP CONSTRAINT "CreditLedgerEntry_shape_valid";
ALTER TABLE "CreditLedgerEntry" ADD CONSTRAINT "CreditLedgerEntry_shape_valid" CHECK (
  length(btrim("requestId")) > 0 AND (
    ("kind" IN ('OPENING_BALANCE','SALE') AND "amount" > 0 AND "receiptId" IS NULL AND "reversalOfId" IS NULL) OR
    ("kind" = 'RECEIPT' AND "amount" < 0 AND "receiptId" IS NOT NULL AND "reversalOfId" IS NULL) OR
    ("kind" = 'RECEIPT_REVERSAL' AND "amount" > 0 AND "receiptId" IS NOT NULL AND "reversalOfId" IS NOT NULL
      AND length(btrim("reason")) > 0 AND length(btrim("evidenceReference")) > 0) OR
    ("kind" = 'DEBIT_ADJUSTMENT' AND "amount" > 0 AND "receiptId" IS NULL AND "reversalOfId" IS NULL
      AND length(btrim("reason")) > 0 AND length(btrim("evidenceReference")) > 0) OR
    ("kind" = 'CREDIT_NOTE' AND "amount" < 0 AND "receiptId" IS NULL AND "reversalOfId" IS NULL
      AND length(btrim("reason")) > 0 AND length(btrim("evidenceReference")) > 0)
  )
);
CREATE OR REPLACE FUNCTION "credit_entry_validate"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE original "CreditLedgerEntry";
BEGIN
  -- Every writer participates in account concurrency, even if it bypasses the service.
  UPDATE "CreditAccount" SET "version" = "version" + 1, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = NEW."accountId";
  IF NEW."effectiveAt" > clock_timestamp() THEN
    RAISE EXCEPTION 'Credit evidence cannot be dated in the future' USING ERRCODE = '23514';
  END IF;
  IF NEW."kind" IN ('OPENING_BALANCE','SALE') AND NOT EXISTS (
    SELECT 1 FROM "ReceivableDocument" d WHERE d."id" = NEW."documentId" AND d."accountId" = NEW."accountId"
      AND d."kind"::text = NEW."kind"::text AND d."amount" = NEW."amount" AND d."issuedAt" = NEW."effectiveAt"
  ) THEN
    RAISE EXCEPTION 'Initial debt entry must match its immutable document' USING ERRCODE = '23514';
  END IF;
  IF NEW."kind" = 'RECEIPT' AND NOT EXISTS (
    SELECT 1 FROM "CreditReceipt" r WHERE r."id" = NEW."receiptId" AND r."accountId" = NEW."accountId" AND r."effectiveAt" = NEW."effectiveAt"
  ) THEN
    RAISE EXCEPTION 'Receipt allocation must match its receipt' USING ERRCODE = '23514';
  END IF;
  IF NEW."kind" = 'RECEIPT_REVERSAL' THEN
    SELECT * INTO original FROM "CreditLedgerEntry" WHERE "id" = NEW."reversalOfId";
    IF NOT FOUND OR original."kind" <> 'RECEIPT' OR original."accountId" <> NEW."accountId"
       OR original."documentId" <> NEW."documentId" OR original."receiptId" <> NEW."receiptId"
       OR original."amount"::numeric + NEW."amount"::numeric <> 0 OR NEW."effectiveAt" < original."effectiveAt" THEN
      RAISE EXCEPTION 'Reversal must exactly compensate its own receipt allocation' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION "credit_account_reconcile"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target TEXT := NEW."accountId"; document_bad BOOLEAN; receipt_bad BOOLEAN; total NUMERIC;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM "ReceivableDocument" d LEFT JOIN "CreditLedgerEntry" e ON e."documentId" = d."id" AND e."accountId" = d."accountId"
    WHERE d."accountId" = target GROUP BY d."id"
    HAVING COUNT(*) FILTER (WHERE e."kind"::text = d."kind"::text) <> 1
       OR COALESCE(SUM(e."amount"),0) < 0 OR COALESCE(SUM(e."amount"),0) > 9223372036854775807
       OR COALESCE(SUM(e."amount") FILTER (WHERE e."kind" IN ('OPENING_BALANCE','SALE','DEBIT_ADJUSTMENT','CREDIT_NOTE')),0) < 0
       OR COALESCE(SUM(e."amount") FILTER (WHERE e."kind" IN ('OPENING_BALANCE','SALE','DEBIT_ADJUSTMENT','CREDIT_NOTE')),0) > 9223372036854775807
  ) INTO document_bad;
  SELECT EXISTS (
    SELECT 1 FROM "CreditReceipt" r LEFT JOIN "CreditLedgerEntry" e ON e."receiptId" = r."id" AND e."accountId" = r."accountId"
    WHERE r."accountId" = target GROUP BY r."id"
    HAVING COALESCE(-SUM(e."amount") FILTER (WHERE e."kind" = 'RECEIPT'),0) <> r."amount"
       -- Reversal is whole-receipt, never a partial hidden reversal.
       OR (COUNT(*) FILTER (WHERE e."kind" = 'RECEIPT_REVERSAL') > 0 AND
           COUNT(*) FILTER (WHERE e."kind" = 'RECEIPT_REVERSAL') <> COUNT(*) FILTER (WHERE e."kind" = 'RECEIPT'))
  ) INTO receipt_bad;
  SELECT COALESCE(SUM("amount"),0) INTO total FROM "CreditLedgerEntry" WHERE "accountId" = target;
  IF document_bad OR receipt_bad OR total < 0 OR total > 9223372036854775807 THEN
    RAISE EXCEPTION 'Credit document/receipt/ledger reconciliation failed' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;

-- A denormalized commercial status alone is not credit evidence.
CREATE FUNCTION "credit_sale_order_reconcile"() RETURNS trigger LANGUAGE plpgsql AS $$
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
    ) THEN
      RAISE EXCEPTION 'Credit sale requires matching immutable debt, staff source, transition and stock evidence without payment' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER "Order_credit_reconcile" AFTER INSERT OR UPDATE ON "Order" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "credit_sale_order_reconcile"();
CREATE CONSTRAINT TRIGGER "ReceivableDocument_sale_reconcile" AFTER INSERT ON "ReceivableDocument" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "credit_sale_order_reconcile"();
CREATE CONSTRAINT TRIGGER "Payment_credit_reconcile" AFTER INSERT OR UPDATE ON "Payment" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "credit_sale_order_reconcile"();

-- Never restore an operator-revoked grant. The baseline registry remains authoritative.
INSERT INTO "Permission" ("id","key","name","description","group","isActive","createdAt","updatedAt")
VALUES ('migration_permission_credit_approve','credit.approve','Approve staff credit sales','Canonical credit.approve permission.','credit',true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
INSERT INTO "AuditLog" ("id","action","entityType","entityId","metadata","createdAt")
SELECT 'migration_audit_register_credit_approve','permission.registered','Permission',"id",
  '{"source":"20261012131000_staff_credit_sales"}'::jsonb,CURRENT_TIMESTAMP FROM "Permission" WHERE "key" = 'credit.approve'
ON CONFLICT ("id") DO NOTHING;
WITH added AS (
 INSERT INTO "RolePermission" ("id","roleId","permissionId","grantedAt")
 SELECT 'migration_credit_approve_' || r."id",r."id",p."id",CURRENT_TIMESTAMP FROM "Role" r CROSS JOIN "Permission" p
 WHERE r."key" = 'system-admin' AND r."isSystem" = true AND p."key" = 'credit.approve'
 ON CONFLICT ("roleId","permissionId") DO NOTHING RETURNING "roleId","permissionId"
)
INSERT INTO "AuditLog" ("id","action","entityType","entityId","metadata","createdAt")
SELECT 'migration_credit_approve_audit_' || "roleId",'role.permission.granted','Role',"roleId",
 jsonb_build_object('permissionId',"permissionId",'source','20261012131000_staff_credit_sales'),CURRENT_TIMESTAMP FROM added;
