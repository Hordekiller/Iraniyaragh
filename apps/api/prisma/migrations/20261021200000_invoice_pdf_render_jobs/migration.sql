-- Render jobs and authorized downloads for the private invoice PDF store.
-- Additive only: the operator still approves every budget before any work runs.
BEGIN;
ALTER TABLE "InvoicePdfStorageCapacity"
  ADD COLUMN "pendingJobCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "maxPendingJobs" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "InvoicePdfStorageCapacity" ADD CONSTRAINT "InvoicePdfStorageCapacity_pending"
  CHECK ("pendingJobCount" BETWEEN 0 AND 1707777 AND "maxPendingJobs" >= 0
    AND "pendingJobCount" <= "maxPendingJobs");

CREATE TABLE "InvoicePdfRenderJob" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "documentId" TEXT NOT NULL,
  "documentPayloadHash" CHAR(64) NOT NULL,
  "renderInputHash" CHAR(64) NOT NULL,
  "rendererRevision" VARCHAR(100) NOT NULL,
  "templateRevision" VARCHAR(100) NOT NULL,
  "fontSha256" CHAR(64) NOT NULL,
  "status" VARCHAR(20) NOT NULL,
  "failureReason" VARCHAR(100),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "leaseVersion" INTEGER NOT NULL DEFAULT 0,
  "leaseOwner" VARCHAR(64),
  "leaseIssuedAt" TIMESTAMP(3),
  "leaseExpireAt" TIMESTAMP(3),
  "requestedByUserId" TEXT NOT NULL,
  "requestedByScope" VARCHAR(20) NOT NULL,
  "requestKeyHash" CHAR(64) NOT NULL,
  "payloadHash" CHAR(64) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InvoicePdfRenderJob_documentId_fkey" FOREIGN KEY ("documentId")
    REFERENCES "InvoiceDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  -- Terminal states do not reopen; stored hashes never change.
  CONSTRAINT "InvoicePdfRenderJob_hashes" CHECK (
    "documentPayloadHash" ~ '^[a-f0-9]{64}$' AND "renderInputHash" ~ '^[a-f0-9]{64}$'
    AND "fontSha256" ~ '^[a-f0-9]{64}$' AND "payloadHash" ~ '^[a-f0-9]{64}$'
    AND "rendererRevision" ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$'
    AND "templateRevision" ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$'
    AND "requestedByScope" IN ('staff', 'customer')
    AND "attempts" BETWEEN 0 AND 20),
  CONSTRAINT "InvoicePdfRenderJob_status" CHECK (
    "status" IN ('PENDING', 'RUNNING', 'READY', 'FAILED')
    AND ("failureReason" IS NULL OR "failureReason" ~ '^[A-Za-z][A-Za-z0-9._-]{0,99}$'))
);
CREATE INDEX "InvoicePdfRenderJob_status_createdAt_id_idx"
  ON "InvoicePdfRenderJob" ("status", "createdAt", "id");
CREATE INDEX "InvoicePdfRenderJob_documentId_createdAt_id_idx"
  ON "InvoicePdfRenderJob" ("documentId", "createdAt", "id");
-- Equal immutable inputs converge on exactly one active job for a document.
CREATE UNIQUE INDEX "InvoicePdfRenderJob_active_input_key"
  ON "InvoicePdfRenderJob" ("documentId", "renderInputHash")
  WHERE "status" IN ('PENDING', 'RUNNING');

CREATE TABLE "InvoicePdfRenderJobCommand" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "documentId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "scope" VARCHAR(20) NOT NULL,
  "keyHash" CHAR(64) NOT NULL,
  "payloadHash" CHAR(64) NOT NULL,
  "jobId" TEXT NOT NULL,
  "outcome" VARCHAR(20) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InvoicePdfRenderJobCommand_jobId_fkey" FOREIGN KEY ("jobId")
    REFERENCES "InvoicePdfRenderJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "InvoicePdfRenderJobCommand_documentId_fkey" FOREIGN KEY ("documentId")
    REFERENCES "InvoiceDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "InvoicePdfRenderJobCommand_hashes" CHECK (
    "keyHash" ~ '^[a-f0-9]{64}$' AND "payloadHash" ~ '^[a-f0-9]{64}$'
    AND "scope" IN ('staff', 'customer')
    AND "outcome" IN ('PENDING', 'READY'))
);
CREATE UNIQUE INDEX "InvoicePdfRenderJobCommand_request_key" ON "InvoicePdfRenderJobCommand"
  ("scope", "actorId", "documentId", "keyHash");

-- Identity columns are immutable; a job only moves between lifecycle states.
CREATE FUNCTION invoice_pdf_job_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."status" <> 'PENDING' OR NEW."attempts" <> 0 OR NEW."leaseVersion" <> 0
      OR NEW."leaseOwner" IS NOT NULL OR NEW."leaseIssuedAt" IS NOT NULL
      OR NEW."leaseExpireAt" IS NOT NULL OR NEW."failureReason" IS NOT NULL THEN
      RAISE EXCEPTION 'Invoice PDF render jobs must be created PENDING without a lease';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD."status" IN ('READY', 'FAILED') THEN
    RAISE EXCEPTION 'Invoice PDF terminal render jobs are immutable';
  END IF;
  IF NEW."documentId" <> OLD."documentId" OR NEW."documentPayloadHash" <> OLD."documentPayloadHash"
    OR NEW."renderInputHash" <> OLD."renderInputHash" OR NEW."rendererRevision" <> OLD."rendererRevision"
    OR NEW."templateRevision" <> OLD."templateRevision" OR NEW."fontSha256" <> OLD."fontSha256"
    OR NEW."requestedByUserId" <> OLD."requestedByUserId" OR NEW."requestedByScope" <> OLD."requestedByScope"
    OR NEW."requestKeyHash" <> OLD."requestKeyHash" OR NEW."payloadHash" <> OLD."payloadHash"
    OR NEW."createdAt" <> OLD."createdAt" THEN
    RAISE EXCEPTION 'Invoice PDF render job identity is immutable';
  END IF;
  IF NEW."status" = 'RUNNING' AND OLD."status" IN ('PENDING', 'RUNNING') THEN
    IF NEW."leaseOwner" IS NULL OR NEW."leaseIssuedAt" IS NULL OR NEW."leaseExpireAt" IS NULL
      OR NEW."leaseVersion" <> OLD."leaseVersion" + 1
      OR NEW."attempts" <> OLD."attempts" + 1 THEN
      RAISE EXCEPTION 'Invoice PDF render lease adjustments require attempts and lease version';
    END IF;
  ELSIF NEW."status" = 'READY' THEN
    IF OLD."status" <> 'RUNNING' THEN
      RAISE EXCEPTION 'Invoice PDF render job state transition is not permitted';
    END IF;
    IF NEW."leaseVersion" IS DISTINCT FROM OLD."leaseVersion"
      OR NEW."attempts" <> OLD."attempts" OR NEW."failureReason" IS NOT NULL THEN
      RAISE EXCEPTION 'Invoice PDF READY completion is lease-stable';
    END IF;
  ELSIF NEW."status" IN ('PENDING', 'FAILED') THEN
    IF OLD."status" <> 'RUNNING' THEN
      RAISE EXCEPTION 'Invoice PDF render job state transition is not permitted';
    END IF;
    IF NEW."leaseOwner" IS NOT NULL OR NEW."leaseIssuedAt" IS NOT NULL
      OR NEW."leaseExpireAt" IS NOT NULL OR NEW."leaseVersion" <> OLD."leaseVersion" THEN
      RAISE EXCEPTION 'Invoice PDF retry or failure releases the lease';
    END IF;
    IF NEW."status" = 'FAILED' AND (
      NEW."failureReason" IS NULL OR NEW."attempts" <> OLD."attempts") THEN
      RAISE EXCEPTION 'Invoice PDF terminal failure demands a stored reason';
    END IF;
  ELSE
    RAISE EXCEPTION 'Invoice PDF render job state transition is not permitted';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "InvoicePdfRenderJob_guard" BEFORE INSERT OR UPDATE
  ON "InvoicePdfRenderJob" FOR EACH ROW EXECUTE FUNCTION invoice_pdf_job_guard();
CREATE TRIGGER "InvoicePdfRenderJobCommand_immutable" BEFORE UPDATE OR DELETE
  ON "InvoicePdfRenderJobCommand" FOR EACH ROW EXECUTE FUNCTION invoice_draft_immutable();
COMMIT;
