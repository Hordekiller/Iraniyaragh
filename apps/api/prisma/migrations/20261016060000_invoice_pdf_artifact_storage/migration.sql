-- Private persistence foundation only: no budget, activation, job or public route.
BEGIN;
CREATE TABLE "InvoicePdfStorageCapacity" (
  "id" VARCHAR(32) NOT NULL PRIMARY KEY,
  "budgetBytes" BIGINT NOT NULL,
  "maxArtifacts" INTEGER NOT NULL,
  "storedBytes" BIGINT NOT NULL DEFAULT 0,
  "artifactCount" INTEGER NOT NULL DEFAULT 0,
  "isEnabled" BOOLEAN NOT NULL DEFAULT false,
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "InvoicePdfStorageCapacity_bounds" CHECK (
    "id" = 'invoice-pdf' AND "budgetBytes" > 0 AND "maxArtifacts" > 0
    AND "storedBytes" BETWEEN 0 AND "budgetBytes"
    AND "artifactCount" BETWEEN 0 AND "maxArtifacts" AND "version" > 0
  )
);

CREATE TABLE "InvoicePdfArtifact" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "documentId" TEXT NOT NULL,
  "documentPayloadHash" CHAR(64) NOT NULL,
  "renderInputHash" CHAR(64) NOT NULL,
  "rendererRevision" VARCHAR(100) NOT NULL,
  "templateRevision" VARCHAR(100) NOT NULL,
  "fontSha256" CHAR(64) NOT NULL,
  "pdfSha256" CHAR(64) NOT NULL,
  "byteCount" INTEGER NOT NULL,
  "bytes" BYTEA NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InvoicePdfArtifact_documentId_fkey" FOREIGN KEY ("documentId")
    REFERENCES "InvoiceDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "InvoicePdfArtifact_bytes" CHECK (
    "byteCount" BETWEEN 5 AND 2097152 AND octet_length("bytes") = "byteCount"
    AND substring("bytes" FROM 1 FOR 5) = convert_to('%PDF-', 'UTF8')
    AND encode(sha256("bytes"), 'hex') = "pdfSha256"
  ),
  CONSTRAINT "InvoicePdfArtifact_hashes" CHECK (
    "documentPayloadHash" ~ '^[a-f0-9]{64}$' AND "renderInputHash" ~ '^[a-f0-9]{64}$'
    AND "fontSha256" ~ '^[a-f0-9]{64}$' AND "pdfSha256" ~ '^[a-f0-9]{64}$'
    AND "rendererRevision" ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$'
    AND "templateRevision" ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$'
  )
);
CREATE UNIQUE INDEX "InvoicePdfArtifact_input_key" ON "InvoicePdfArtifact"
  ("documentId", "renderInputHash", "rendererRevision", "templateRevision", "fontSha256");
CREATE INDEX "InvoicePdfArtifact_documentId_createdAt_id_idx" ON "InvoicePdfArtifact" ("documentId", "createdAt", "id");

CREATE FUNCTION invoice_pdf_capacity_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."storedBytes" <> 0 OR NEW."artifactCount" <> 0 OR NEW."version" <> 1 THEN
      RAISE EXCEPTION 'Invoice PDF capacity must start empty';
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Invoice PDF capacity evidence cannot be deleted';
  ELSIF NEW."storedBytes" <> OLD."storedBytes" OR NEW."artifactCount" <> OLD."artifactCount" THEN
    -- Only the nested artifact INSERT trigger charges capacity. Direct counter
    -- changes are forbidden; no cleanup decrements immutable evidence.
    IF pg_trigger_depth() <> 2 OR NEW."storedBytes" <= OLD."storedBytes"
      OR NEW."artifactCount" <> OLD."artifactCount" + 1
      OR NEW."id" <> OLD."id" OR NEW."budgetBytes" <> OLD."budgetBytes"
      OR NEW."maxArtifacts" <> OLD."maxArtifacts" OR NEW."isEnabled" <> OLD."isEnabled"
      OR NEW."version" <> OLD."version" THEN
      RAISE EXCEPTION 'Invoice PDF counters require an artifact insert';
    END IF;
  ELSIF NEW."id" <> OLD."id" OR NEW."version" <> OLD."version" + 1 THEN
    RAISE EXCEPTION 'Invoice PDF capacity configuration requires its next version';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "InvoicePdfStorageCapacity_guard" BEFORE INSERT OR UPDATE OR DELETE
  ON "InvoicePdfStorageCapacity" FOR EACH ROW EXECUTE FUNCTION invoice_pdf_capacity_guard();

CREATE FUNCTION invoice_pdf_artifact_reserve() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE capacity "InvoicePdfStorageCapacity"%ROWTYPE;
BEGIN
  SELECT * INTO capacity FROM "InvoicePdfStorageCapacity" WHERE "id" = 'invoice-pdf' FOR UPDATE;
  IF NOT FOUND OR NOT capacity."isEnabled" THEN
    RAISE EXCEPTION 'Invoice PDF storage is not enabled';
  END IF;
  IF NEW."byteCount" < 5 OR NEW."byteCount" > 2097152
    OR capacity."artifactCount" >= capacity."maxArtifacts"
    OR NEW."byteCount" > capacity."budgetBytes" - capacity."storedBytes" THEN
    RAISE EXCEPTION 'Invoice PDF storage capacity exceeded';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "InvoiceDocument" WHERE "id" = NEW."documentId"
    AND "payloadHash" = NEW."documentPayloadHash") THEN
    RAISE EXCEPTION 'Invoice PDF immutable document does not match';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "InvoicePdfArtifact_reserve" BEFORE INSERT ON "InvoicePdfArtifact"
  FOR EACH ROW EXECUTE FUNCTION invoice_pdf_artifact_reserve();

-- Charge only successful inserts. ON CONFLICT DO NOTHING cannot consume bytes.
CREATE FUNCTION invoice_pdf_artifact_charge() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE "InvoicePdfStorageCapacity" SET "storedBytes" = "storedBytes" + NEW."byteCount",
    "artifactCount" = "artifactCount" + 1 WHERE "id" = 'invoice-pdf';
  RETURN NEW;
END;
$$;
CREATE TRIGGER "InvoicePdfArtifact_charge" AFTER INSERT ON "InvoicePdfArtifact"
  FOR EACH ROW EXECUTE FUNCTION invoice_pdf_artifact_charge();
CREATE TRIGGER "InvoicePdfArtifact_immutable" BEFORE UPDATE OR DELETE ON "InvoicePdfArtifact"
  FOR EACH ROW EXECUTE FUNCTION invoice_draft_immutable();
COMMIT;
