-- Store-invoice configuration only. No historical money/stock/provider state changes.
CREATE TYPE "InvoiceTaxTreatment" AS ENUM ('EXCLUSIVE', 'INCLUSIVE', 'EXEMPT');
CREATE TABLE "InvoicePolicyRevision" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "version" INTEGER NOT NULL,
  "sellerName" VARCHAR(200) NOT NULL,
  "sellerAddress" VARCHAR(1000) NOT NULL,
  "sellerContact" VARCHAR(200) NOT NULL,
  "taxTreatment" "InvoiceTaxTreatment" NOT NULL,
  "taxRateBps" INTEGER NOT NULL,
  "exemptionReason" VARCHAR(500),
  "discountCapBps" INTEGER NOT NULL,
  "shippingTaxable" BOOLEAN NOT NULL,
  "isActive" BOOLEAN NOT NULL,
  "reason" VARCHAR(500) NOT NULL,
  "actorId" TEXT NOT NULL,
  "requestId" VARCHAR(100) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InvoicePolicyRevision_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "invoice_policy_bounds" CHECK ("version" > 0 AND "taxRateBps" BETWEEN 0 AND 10000 AND "discountCapBps" BETWEEN 0 AND 10000),
  CONSTRAINT "invoice_policy_exemption" CHECK (
    ("taxTreatment" = 'EXEMPT' AND "taxRateBps" = 0 AND "exemptionReason" IS NOT NULL AND length(btrim("exemptionReason")) > 0) OR
    ("taxTreatment" <> 'EXEMPT' AND "exemptionReason" IS NULL)),
  CONSTRAINT "invoice_policy_text" CHECK (
    length(btrim("sellerName")) > 0 AND length(btrim("sellerAddress")) > 0 AND length(btrim("sellerContact")) > 0 AND length(btrim("reason")) > 0 AND length(btrim("requestId")) > 0 AND
    "sellerName" !~ '[[:cntrl:]<>]' AND "sellerAddress" !~ '[[:cntrl:]<>]' AND "sellerContact" !~ '[[:cntrl:]<>]' AND "reason" !~ '[[:cntrl:]<>]' AND coalesce("exemptionReason", '') !~ '[[:cntrl:]<>]')
);
CREATE UNIQUE INDEX "InvoicePolicyRevision_version_key" ON "InvoicePolicyRevision"("version");
CREATE TABLE "InvoicePolicyCommand" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "actorId" TEXT NOT NULL,
  "keyHash" CHAR(64) NOT NULL,
  "payloadHash" CHAR(64) NOT NULL,
  "revisionId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InvoicePolicyCommand_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "InvoicePolicyCommand_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "InvoicePolicyRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "invoice_policy_command_hashes" CHECK ("keyHash" ~ '^[a-f0-9]{64}$' AND "payloadHash" ~ '^[a-f0-9]{64}$')
);
CREATE UNIQUE INDEX "InvoicePolicyCommand_actorId_keyHash_key" ON "InvoicePolicyCommand"("actorId", "keyHash");

CREATE FUNCTION invoice_policy_append_only() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Invoice policy evidence is append-only' USING ERRCODE = '23514';
END $$;
CREATE TRIGGER invoice_policy_immutable BEFORE UPDATE OR DELETE ON "InvoicePolicyRevision"
  FOR EACH ROW EXECUTE FUNCTION invoice_policy_append_only();
CREATE TRIGGER invoice_policy_command_immutable BEFORE UPDATE OR DELETE ON "InvoicePolicyCommand"
  FOR EACH ROW EXECUTE FUNCTION invoice_policy_append_only();
CREATE FUNCTION invoice_policy_version_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(1936608609, 1768842863);
  IF NEW."version"::bigint <> coalesce((SELECT max("version")::bigint FROM "InvoicePolicyRevision"), 0) + 1 THEN
    RAISE EXCEPTION 'Invoice policy version must append the next revision' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER invoice_policy_version BEFORE INSERT ON "InvoicePolicyRevision"
  FOR EACH ROW EXECUTE FUNCTION invoice_policy_version_guard();
