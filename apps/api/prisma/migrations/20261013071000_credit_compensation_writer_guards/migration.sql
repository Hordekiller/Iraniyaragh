-- Serialize every SQL writer of new compensation evidence, including callers
-- outside the application advisory-lock boundary.
CREATE OR REPLACE FUNCTION "credit_return_stock_immutable"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS (SELECT 1 FROM "CreditSaleReturnLine" WHERE "movementId" = OLD."id") THEN
  RAISE EXCEPTION 'Returned stock evidence is immutable' USING ERRCODE = '23514';
 END IF;
 IF TG_OP = 'UPDATE' THEN RETURN NEW; END IF;
 RETURN OLD;
END;
$$;
CREATE FUNCTION "credit_compensation_writer_lock"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_order TEXT; target_account TEXT;
BEGIN
 IF TG_TABLE_NAME = 'CreditSaleReturn' THEN
  target_order := NEW."orderId";
  SELECT "accountId" INTO target_account FROM "ReceivableDocument" WHERE "id" = NEW."documentId";
 ELSE
  SELECT r."orderId",d."accountId" INTO target_order,target_account
  FROM "CreditSaleReturn" r JOIN "ReceivableDocument" d ON d."id" = r."documentId" WHERE r."id" = NEW."returnId";
 END IF;
 PERFORM "id" FROM "Order" WHERE "id" = target_order FOR UPDATE;
 PERFORM "id" FROM "CreditAccount" WHERE "id" = target_account FOR UPDATE;
 IF TG_TABLE_NAME = 'CreditRefundPayout' OR NEW."debtCredit" = 0 THEN
  UPDATE "CreditAccount" SET "version" = "version" + 1, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = target_account;
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER "CreditSaleReturn_writer_lock" BEFORE INSERT ON "CreditSaleReturn" FOR EACH ROW EXECUTE FUNCTION "credit_compensation_writer_lock"();
CREATE TRIGGER "CreditRefundPayout_writer_lock" BEFORE INSERT ON "CreditRefundPayout" FOR EACH ROW EXECUTE FUNCTION "credit_compensation_writer_lock"();
