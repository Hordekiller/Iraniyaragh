-- Resolve table-specific fields only inside the matching trigger branch.
CREATE OR REPLACE FUNCTION "credit_compensation_writer_lock"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_order TEXT; target_account TEXT; advance_version BOOLEAN;
BEGIN
 IF TG_TABLE_NAME = 'CreditSaleReturn' THEN
  advance_version := NEW."debtCredit" = 0;
  target_order := NEW."orderId";
  SELECT "accountId" INTO target_account FROM "ReceivableDocument" WHERE "id" = NEW."documentId";
 ELSE
  advance_version := true;
  SELECT r."orderId",d."accountId" INTO target_order,target_account
  FROM "CreditSaleReturn" r JOIN "ReceivableDocument" d ON d."id" = r."documentId" WHERE r."id" = NEW."returnId";
 END IF;
 PERFORM "id" FROM "Order" WHERE "id" = target_order FOR UPDATE;
 PERFORM "id" FROM "CreditAccount" WHERE "id" = target_account FOR UPDATE;
 IF advance_version THEN
  UPDATE "CreditAccount" SET "version" = "version" + 1, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = target_account;
 END IF;
 RETURN NEW;
END;
$$;
