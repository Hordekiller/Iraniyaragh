-- CreateEnum
CREATE TYPE "CreditAccountStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "ReceivableDocumentKind" AS ENUM ('OPENING_BALANCE');

-- CreateEnum
CREATE TYPE "CreditEntryKind" AS ENUM ('OPENING_BALANCE', 'RECEIPT', 'RECEIPT_REVERSAL', 'DEBIT_ADJUSTMENT', 'CREDIT_NOTE');

-- CreateEnum
CREATE TYPE "CreditReceiptMethod" AS ENUM ('CASH', 'BANK_TRANSFER');

-- CreateTable
CREATE TABLE "CreditAccount" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "status" "CreditAccountStatus" NOT NULL DEFAULT 'SUSPENDED',
    "creditLimit" BIGINT NOT NULL DEFAULT 0,
    "termsDays" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReceivableDocument" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "kind" "ReceivableDocumentKind" NOT NULL,
    "amount" BIGINT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "termsDays" INTEGER NOT NULL,
    "sourceReference" VARCHAR(128) NOT NULL,
    "actorId" TEXT NOT NULL,
    "requestId" VARCHAR(100) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReceivableDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditReceipt" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "method" "CreditReceiptMethod" NOT NULL,
    "evidenceReference" VARCHAR(128) NOT NULL,
    "evidenceHash" CHAR(64) NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "actorId" TEXT NOT NULL,
    "requestId" VARCHAR(100) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditLedgerEntry" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "receiptId" TEXT,
    "reversalOfId" TEXT,
    "kind" "CreditEntryKind" NOT NULL,
    "amount" BIGINT NOT NULL,
    "evidenceReference" VARCHAR(128),
    "reason" VARCHAR(500),
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "actorId" TEXT NOT NULL,
    "requestId" VARCHAR(100) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditCommandRecord" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "scope" VARCHAR(100) NOT NULL,
    "keyHash" CHAR(64) NOT NULL,
    "payloadHash" CHAR(64) NOT NULL,
    "response" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditCommandRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CreditAccount_customerId_key" ON "CreditAccount"("customerId");

-- CreateIndex
CREATE INDEX "ReceivableDocument_accountId_dueAt_idx" ON "ReceivableDocument"("accountId", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReceivableDocument_accountId_kind_key" ON "ReceivableDocument"("accountId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "ReceivableDocument_id_accountId_key" ON "ReceivableDocument"("id", "accountId");

-- CreateIndex
CREATE UNIQUE INDEX "CreditReceipt_evidenceHash_key" ON "CreditReceipt"("evidenceHash");

-- CreateIndex
CREATE INDEX "CreditReceipt_accountId_effectiveAt_idx" ON "CreditReceipt"("accountId", "effectiveAt");

-- CreateIndex
CREATE UNIQUE INDEX "CreditReceipt_id_accountId_key" ON "CreditReceipt"("id", "accountId");

-- CreateIndex
CREATE UNIQUE INDEX "CreditLedgerEntry_reversalOfId_key" ON "CreditLedgerEntry"("reversalOfId");

-- CreateIndex
CREATE INDEX "CreditLedgerEntry_accountId_createdAt_id_idx" ON "CreditLedgerEntry"("accountId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "CreditLedgerEntry_documentId_idx" ON "CreditLedgerEntry"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "CreditLedgerEntry_receiptId_documentId_kind_key" ON "CreditLedgerEntry"("receiptId", "documentId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "CreditCommandRecord_actorId_scope_keyHash_key" ON "CreditCommandRecord"("actorId", "scope", "keyHash");

-- AddForeignKey
ALTER TABLE "CreditAccount" ADD CONSTRAINT "CreditAccount_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceivableDocument" ADD CONSTRAINT "ReceivableDocument_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CreditAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceivableDocument" ADD CONSTRAINT "ReceivableDocument_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditReceipt" ADD CONSTRAINT "CreditReceipt_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CreditAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditReceipt" ADD CONSTRAINT "CreditReceipt_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditLedgerEntry" ADD CONSTRAINT "CreditLedgerEntry_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CreditAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditLedgerEntry" ADD CONSTRAINT "CreditLedgerEntry_documentId_accountId_fkey" FOREIGN KEY ("documentId", "accountId") REFERENCES "ReceivableDocument"("id", "accountId") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "CreditLedgerEntry" ADD CONSTRAINT "CreditLedgerEntry_receiptId_accountId_fkey" FOREIGN KEY ("receiptId", "accountId") REFERENCES "CreditReceipt"("id", "accountId") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "CreditLedgerEntry" ADD CONSTRAINT "CreditLedgerEntry_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditLedgerEntry" ADD CONSTRAINT "CreditLedgerEntry_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "CreditLedgerEntry"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "CreditCommandRecord" ADD CONSTRAINT "CreditCommandRecord_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- New, empty financial tables only. No existing orders/payments/stock are reclassified.
ALTER TABLE "CreditAccount" ADD CONSTRAINT "CreditAccount_policy_valid"
  CHECK ("creditLimit" >= 0 AND "termsDays" BETWEEN 0 AND 365 AND "version" >= 0);
ALTER TABLE "ReceivableDocument" ADD CONSTRAINT "ReceivableDocument_evidence_valid"
  CHECK ("amount" > 0 AND "termsDays" BETWEEN 0 AND 365 AND "dueAt" >= "issuedAt"
    AND length(btrim("sourceReference")) > 0 AND length(btrim("requestId")) > 0);
ALTER TABLE "CreditReceipt" ADD CONSTRAINT "CreditReceipt_evidence_valid"
  CHECK ("amount" > 0 AND length(btrim("evidenceReference")) > 0 AND length(btrim("requestId")) > 0);
ALTER TABLE "CreditLedgerEntry" ADD CONSTRAINT "CreditLedgerEntry_shape_valid" CHECK (
  length(btrim("requestId")) > 0 AND (
    ("kind" = 'OPENING_BALANCE' AND "amount" > 0 AND "receiptId" IS NULL AND "reversalOfId" IS NULL) OR
    ("kind" = 'RECEIPT' AND "amount" < 0 AND "receiptId" IS NOT NULL AND "reversalOfId" IS NULL) OR
    ("kind" = 'RECEIPT_REVERSAL' AND "amount" > 0 AND "receiptId" IS NOT NULL AND "reversalOfId" IS NOT NULL
      AND length(btrim("reason")) > 0 AND length(btrim("evidenceReference")) > 0) OR
    ("kind" = 'DEBIT_ADJUSTMENT' AND "amount" > 0 AND "receiptId" IS NULL AND "reversalOfId" IS NULL
      AND length(btrim("reason")) > 0 AND length(btrim("evidenceReference")) > 0) OR
    ("kind" = 'CREDIT_NOTE' AND "amount" < 0 AND "receiptId" IS NULL AND "reversalOfId" IS NULL
      AND length(btrim("reason")) > 0 AND length(btrim("evidenceReference")) > 0)
  )
);
-- SQL CHECK accepts NULL; make mandatory evidence explicit for correcting entries.
ALTER TABLE "CreditLedgerEntry" ADD CONSTRAINT "CreditLedgerEntry_correction_evidence" CHECK (
  "kind" NOT IN ('RECEIPT_REVERSAL','DEBIT_ADJUSTMENT','CREDIT_NOTE') OR
  ("reason" IS NOT NULL AND "evidenceReference" IS NOT NULL)
);
CREATE UNIQUE INDEX "CreditLedgerEntry_opening_once" ON "CreditLedgerEntry"("documentId") WHERE "kind" = 'OPENING_BALANCE';

CREATE FUNCTION "credit_financial_immutable"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Financial credit evidence is immutable; append a compensating document' USING ERRCODE = '23514';
END;
$$;
CREATE TRIGGER "ReceivableDocument_immutable" BEFORE UPDATE OR DELETE ON "ReceivableDocument" FOR EACH ROW EXECUTE FUNCTION "credit_financial_immutable"();
CREATE TRIGGER "CreditReceipt_immutable" BEFORE UPDATE OR DELETE ON "CreditReceipt" FOR EACH ROW EXECUTE FUNCTION "credit_financial_immutable"();
CREATE TRIGGER "CreditLedgerEntry_immutable" BEFORE UPDATE OR DELETE ON "CreditLedgerEntry" FOR EACH ROW EXECUTE FUNCTION "credit_financial_immutable"();

CREATE FUNCTION "credit_entry_validate"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE original "CreditLedgerEntry";
BEGIN
  -- Every writer participates in account concurrency, even if it bypasses the service.
  UPDATE "CreditAccount" SET "version" = "version" + 1, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = NEW."accountId";
  IF NEW."effectiveAt" > clock_timestamp() THEN
    RAISE EXCEPTION 'Credit evidence cannot be dated in the future' USING ERRCODE = '23514';
  END IF;
  IF NEW."kind" = 'OPENING_BALANCE' AND NOT EXISTS (
    SELECT 1 FROM "ReceivableDocument" d WHERE d."id" = NEW."documentId" AND d."accountId" = NEW."accountId"
      AND d."kind" = 'OPENING_BALANCE' AND d."amount" = NEW."amount" AND d."issuedAt" = NEW."effectiveAt"
  ) THEN
    RAISE EXCEPTION 'Opening entry must match its immutable document' USING ERRCODE = '23514';
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
CREATE TRIGGER "CreditLedgerEntry_validate" BEFORE INSERT ON "CreditLedgerEntry" FOR EACH ROW EXECUTE FUNCTION "credit_entry_validate"();

CREATE FUNCTION "credit_account_reconcile"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target TEXT := NEW."accountId"; document_bad BOOLEAN; receipt_bad BOOLEAN; total NUMERIC;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM "ReceivableDocument" d LEFT JOIN "CreditLedgerEntry" e ON e."documentId" = d."id" AND e."accountId" = d."accountId"
    WHERE d."accountId" = target GROUP BY d."id"
    HAVING COUNT(*) FILTER (WHERE e."kind" = 'OPENING_BALANCE') <> 1
       OR COALESCE(SUM(e."amount"),0) < 0 OR COALESCE(SUM(e."amount"),0) > 9223372036854775807
       OR COALESCE(SUM(e."amount") FILTER (WHERE e."kind" IN ('OPENING_BALANCE','DEBIT_ADJUSTMENT','CREDIT_NOTE')),0) < 0
       OR COALESCE(SUM(e."amount") FILTER (WHERE e."kind" IN ('OPENING_BALANCE','DEBIT_ADJUSTMENT','CREDIT_NOTE')),0) > 9223372036854775807
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
CREATE CONSTRAINT TRIGGER "CreditLedgerEntry_reconcile" AFTER INSERT ON "CreditLedgerEntry" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "credit_account_reconcile"();
CREATE CONSTRAINT TRIGGER "ReceivableDocument_reconcile" AFTER INSERT ON "ReceivableDocument" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "credit_account_reconcile"();
CREATE CONSTRAINT TRIGGER "CreditReceipt_reconcile" AFTER INSERT ON "CreditReceipt" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "credit_account_reconcile"();

-- Add only new capabilities to the existing system role; never resurrect a revoked grant.
INSERT INTO "Permission" ("id","key","name","description","group","isActive","createdAt","updatedAt")
SELECT 'migration_permission_' || replace(key,'.','_'), key, name, 'Canonical ' || key || ' permission.', 'credit', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (VALUES ('credit.read','Read customer receivables'), ('credit.manage','Manage credit account policies'),
  ('credit.opening','Record evidenced opening balances'), ('credit.receive','Record credit receipts'),
  ('credit.adjust','Correct receivable evidence')) AS capabilities(key,name)
ON CONFLICT ("key") DO NOTHING;
INSERT INTO "AuditLog" ("id","action","entityType","entityId","metadata","createdAt")
SELECT 'migration_audit_register_' || replace("key",'.','_'), 'permission.registered', 'Permission', "id",
  '{"source":"20261012120000_customer_credit_ledger"}'::jsonb, CURRENT_TIMESTAMP
FROM "Permission" WHERE "key" IN ('credit.read','credit.manage','credit.opening','credit.receive','credit.adjust')
ON CONFLICT ("id") DO NOTHING;
WITH added AS (
  INSERT INTO "RolePermission" ("id","roleId","permissionId","grantedAt")
  SELECT 'migration_credit_grant_' || p."id" || '_' || r."id", r."id", p."id", CURRENT_TIMESTAMP
  FROM "Role" r CROSS JOIN "Permission" p
  WHERE r."key" = 'system-admin' AND r."isSystem" = true
    AND p."key" IN ('credit.read','credit.manage','credit.opening','credit.receive','credit.adjust')
  ON CONFLICT ("roleId","permissionId") DO NOTHING RETURNING "roleId","permissionId"
)
INSERT INTO "AuditLog" ("id","action","entityType","entityId","metadata","createdAt")
SELECT 'migration_credit_grant_audit_' || "permissionId" || '_' || "roleId", 'role.permission.granted', 'Role', "roleId",
 jsonb_build_object('permissionId',"permissionId",'source','20261012120000_customer_credit_ledger'), CURRENT_TIMESTAMP FROM added;
