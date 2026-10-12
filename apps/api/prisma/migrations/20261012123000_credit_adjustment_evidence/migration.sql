-- Add a second guard for operator retries using a fresh key after browser reload.
-- Financial corrections require unique evidence per account/document. No existing
-- evidence is rewritten. Fail if a prior deployment has unkeyed corrections.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "CreditLedgerEntry" WHERE "kind" IN ('DEBIT_ADJUSTMENT','CREDIT_NOTE')) THEN
    RAISE EXCEPTION 'Credit corrections exist without unique evidence; reconcile before migration';
  END IF;
END $$;
ALTER TABLE "CreditLedgerEntry" ADD COLUMN "evidenceHash" CHAR(64);
CREATE UNIQUE INDEX "CreditLedgerEntry_evidenceHash_key" ON "CreditLedgerEntry"("evidenceHash");
ALTER TABLE "CreditLedgerEntry" ADD CONSTRAINT "CreditLedgerEntry_adjustment_evidence_hash" CHECK (
  "kind" NOT IN ('DEBIT_ADJUSTMENT','CREDIT_NOTE') OR ("evidenceHash" IS NOT NULL AND "evidenceHash" ~ '^[a-f0-9]{64}$')
);

CREATE FUNCTION "credit_entry_chronology"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "ReceivableDocument" WHERE "id" = NEW."documentId" AND "issuedAt" > NEW."effectiveAt") THEN
    RAISE EXCEPTION 'Credit posting cannot precede its debt document' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "CreditLedgerEntry_chronology" BEFORE INSERT ON "CreditLedgerEntry" FOR EACH ROW EXECUTE FUNCTION "credit_entry_chronology"();
