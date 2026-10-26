-- Bounded report-export job pipeline (ADR R2 / #423). Additive only: the
-- operator still approves every budget, retention and activation command.
BEGIN;
CREATE TABLE "ReportExportStorageCapacity" (
  "id" VARCHAR(32) NOT NULL PRIMARY KEY,
  "budgetBytes" BIGINT NOT NULL,
  "maxArtifacts" INTEGER NOT NULL,
  "storedBytes" BIGINT NOT NULL DEFAULT 0,
  "artifactCount" INTEGER NOT NULL DEFAULT 0,
  "pendingJobCount" INTEGER NOT NULL DEFAULT 0,
  "maxPendingJobs" INTEGER NOT NULL DEFAULT 0,
  "maxRetentionMs" BIGINT NOT NULL DEFAULT 0,
  "isEnabled" BOOLEAN NOT NULL DEFAULT false,
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "ReportExportStorageCapacity_bounds" CHECK (
    "id" = 'report-export' AND "budgetBytes" > 0 AND "maxArtifacts" > 0
    AND "storedBytes" BETWEEN 0 AND "budgetBytes"
    AND "artifactCount" BETWEEN 0 AND "maxArtifacts"
    AND "pendingJobCount" BETWEEN 0 AND 1707777 AND "maxPendingJobs" >= 0
    AND "pendingJobCount" <= "maxPendingJobs"
    AND "maxRetentionMs" > 0 AND "maxRetentionMs" <= 946708560000
    AND "version" > 0
  )
);

CREATE TABLE "ReportExportJob" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "reportKind" VARCHAR(30) NOT NULL,
  "outputFormat" VARCHAR(10) NOT NULL,
  "definitionHash" CHAR(64) NOT NULL,
  "definition" JSONB NOT NULL,
  "rendererRevision" VARCHAR(100) NOT NULL,
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
  CONSTRAINT "ReportExportJob_bounds" CHECK (
    "reportKind" IN ('operations-summary', 'orders', 'debtors')
    AND "outputFormat" IN ('csv', 'xlsx')
    AND "definitionHash" ~ '^[a-f0-9]{64}$' AND "requestKeyHash" ~ '^[a-f0-9]{64}$'
    AND "payloadHash" ~ '^[a-f0-9]{64}$'
    AND "rendererRevision" ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$'
    AND "requestedByScope" = 'staff'
    AND "attempts" BETWEEN 0 AND 20),
  CONSTRAINT "ReportExportJob_status" CHECK (
    "status" IN ('PENDING', 'RUNNING', 'READY', 'FAILED')
    AND ("failureReason" IS NULL OR "failureReason" ~ '^[A-Za-z][A-Za-z0-9._-]{0,99}$'))
);
CREATE INDEX "ReportExportJob_status_createdAt_id_idx"
  ON "ReportExportJob" ("status", "createdAt", "id");
CREATE INDEX "ReportExportJob_requestedByUserId_createdAt_id_idx"
  ON "ReportExportJob" ("requestedByUserId", "createdAt", "id");
-- Equal immutable definitions converge on exactly one active job across
-- every requester; later live queries are explicit new exports.
CREATE UNIQUE INDEX "ReportExportJob_active_input_key"
  ON "ReportExportJob" ("reportKind", "definitionHash", "outputFormat")
  WHERE "status" IN ('PENDING', 'RUNNING');

CREATE TABLE "ReportExportCommand" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "actorId" TEXT NOT NULL,
  "reportKind" VARCHAR(30) NOT NULL,
  "outputFormat" VARCHAR(10) NOT NULL,
  "definitionHash" CHAR(64) NOT NULL,
  "keyHash" CHAR(64) NOT NULL,
  "payloadHash" CHAR(64) NOT NULL,
  "jobId" TEXT NOT NULL,
  "outcome" VARCHAR(20) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReportExportCommand_jobId_fkey" FOREIGN KEY ("jobId")
    REFERENCES "ReportExportJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ReportExportCommand_bounds" CHECK (
    "reportKind" IN ('operations-summary', 'orders', 'debtors')
    AND "outputFormat" IN ('csv', 'xlsx')
    AND "keyHash" ~ '^[a-f0-9]{64}$' AND "payloadHash" ~ '^[a-f0-9]{64}$'
    AND "outcome" IN ('PENDING', 'READY'))
);
CREATE UNIQUE INDEX "ReportExportCommand_request_key" ON "ReportExportCommand"
  ("actorId", "reportKind", "outputFormat", "definitionHash", "keyHash");

CREATE TABLE "ReportExportArtifact" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "jobId" TEXT NOT NULL,
  "jobRequestKeyHash" CHAR(64) NOT NULL,
  "reportKind" VARCHAR(30) NOT NULL,
  "outputFormat" VARCHAR(10) NOT NULL,
  "definitionHash" CHAR(64) NOT NULL,
  "rendererRevision" VARCHAR(100) NOT NULL,
  "contentSha256" CHAR(64) NOT NULL,
  "byteCount" INTEGER NOT NULL,
  "bytes" BYTEA NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReportExportArtifact_jobId_fkey" FOREIGN KEY ("jobId")
    REFERENCES "ReportExportJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ReportExportArtifact_bounds" CHECK (
    "byteCount" BETWEEN 1 AND 10485760 AND octet_length("bytes") = "byteCount"
    AND encode(sha256("bytes"), 'hex') = "contentSha256"
    AND ("outputFormat" <> 'xlsx' OR substring("bytes" FROM 1 FOR 2) = convert_to('PK', 'UTF8'))
    AND "reportKind" IN ('operations-summary', 'orders', 'debtors')
    AND "jobRequestKeyHash" ~ '^[a-f0-9]{64}$'
    AND "definitionHash" ~ '^[a-f0-9]{64}$' AND "contentSha256" ~ '^[a-f0-9]{64}$'
    AND "rendererRevision" ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$'),
  CONSTRAINT "ReportExportArtifact_content_identity" CHECK (
    "id" = "jobId")
);
CREATE INDEX "ReportExportArtifact_expiresAt_idx" ON "ReportExportArtifact" ("expiresAt");
-- One accepted per durable job: the artifact identity IS the job identity.
CREATE UNIQUE INDEX "ReportExportArtifact_jobId_key" ON "ReportExportArtifact" ("jobId");

-- Identity columns are immutable; a job only moves between lifecycle states
-- (same lifecycle discipline as the private invoice PDF renderer).
CREATE FUNCTION report_export_job_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."status" <> 'PENDING' OR NEW."attempts" <> 0 OR NEW."leaseVersion" <> 0
      OR NEW."leaseOwner" IS NOT NULL OR NEW."leaseIssuedAt" IS NOT NULL
      OR NEW."leaseExpireAt" IS NOT NULL OR NEW."failureReason" IS NOT NULL THEN
      RAISE EXCEPTION 'Report export jobs must be created PENDING without a lease';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD."status" IN ('READY', 'FAILED') THEN
    RAISE EXCEPTION 'Report export terminal jobs are immutable';
  END IF;
  IF NEW."reportKind" <> OLD."reportKind" OR NEW."outputFormat" <> OLD."outputFormat"
    OR NEW."definitionHash" <> OLD."definitionHash" OR NEW."definition" IS DISTINCT FROM OLD."definition"
    OR NEW."rendererRevision" <> OLD."rendererRevision"
    OR NEW."requestedByUserId" <> OLD."requestedByUserId" OR NEW."requestedByScope" <> OLD."requestedByScope"
    OR NEW."requestKeyHash" <> OLD."requestKeyHash" OR NEW."payloadHash" <> OLD."payloadHash"
    OR NEW."createdAt" <> OLD."createdAt" THEN
    RAISE EXCEPTION 'Report export job identity is immutable';
  END IF;
  IF NEW."status" = 'RUNNING' AND OLD."status" IN ('PENDING', 'RUNNING') THEN
    IF NEW."leaseOwner" IS NULL OR NEW."leaseIssuedAt" IS NULL OR NEW."leaseExpireAt" IS NULL
      OR NEW."leaseVersion" <> OLD."leaseVersion" + 1
      OR NEW."attempts" <> OLD."attempts" + 1 THEN
      RAISE EXCEPTION 'Report export lease adjustments require attempts and lease version';
    END IF;
  ELSIF NEW."status" = 'READY' THEN
    IF OLD."status" <> 'RUNNING' THEN
      RAISE EXCEPTION 'Report export job state transition is not permitted';
    END IF;
    IF NEW."leaseVersion" IS DISTINCT FROM OLD."leaseVersion"
      OR NEW."attempts" <> OLD."attempts" OR NEW."failureReason" IS NOT NULL THEN
      RAISE EXCEPTION 'Report export READY completion is lease-stable';
    END IF;
  ELSIF NEW."status" IN ('PENDING', 'FAILED') THEN
    IF OLD."status" <> 'RUNNING' THEN
      RAISE EXCEPTION 'Report export job state transition is not permitted';
    END IF;
    IF NEW."leaseOwner" IS NOT NULL OR NEW."leaseIssuedAt" IS NOT NULL
      OR NEW."leaseExpireAt" IS NOT NULL OR NEW."leaseVersion" <> OLD."leaseVersion" THEN
      RAISE EXCEPTION 'Report export retry or failure releases the lease';
    END IF;
    IF NEW."status" = 'FAILED' AND (
      NEW."failureReason" IS NULL OR NEW."attempts" <> OLD."attempts") THEN
      RAISE EXCEPTION 'Report export terminal failure demands a stored reason';
    END IF;
  ELSE
    RAISE EXCEPTION 'Report export job state transition is not permitted';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "ReportExportJob_guard" BEFORE INSERT OR UPDATE
  ON "ReportExportJob" FOR EACH ROW EXECUTE FUNCTION report_export_job_guard();
CREATE TRIGGER "ReportExportCommand_immutable" BEFORE UPDATE OR DELETE
  ON "ReportExportCommand" FOR EACH ROW EXECUTE FUNCTION invoice_draft_immutable();

-- Capacity stays an operator state. Non-artifact, non-cleanup counter edits
-- must come from the nested artifact trigger with the exact version bump.
CREATE FUNCTION report_export_capacity_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."storedBytes" <> 0 OR NEW."artifactCount" <> 0
      OR NEW."pendingJobCount" <> 0 OR NEW."version" <> 1 THEN
      RAISE EXCEPTION 'Report export capacity must start empty';
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Report export capacity evidence cannot be deleted';
  ELSIF (NEW."storedBytes" <> OLD."storedBytes" OR NEW."artifactCount" <> OLD."artifactCount") THEN
    -- Cleanup releases bytes downward inside a session that opted in with SET
    -- LOCAL; direct counter edits must be the nested artifact INSERT trigger
    -- (depth 2). Pending-job flow stays on the version path below, exactly
    -- like the invoice PDF flow. Database-owner privileges can always alter
    -- these triggers, so this remains an integrity guard, not an access gate.
    IF current_setting('app.report_export_cleanup', true) = 'on' THEN
      IF NEW."storedBytes" > OLD."storedBytes" OR NEW."artifactCount" > OLD."artifactCount"
        OR NEW."pendingJobCount" <> OLD."pendingJobCount"
        OR NEW."id" <> OLD."id" OR NEW."version" <> OLD."version" THEN
        RAISE EXCEPTION 'Report export cleanup only releases capacity';
      END IF;
      RETURN NEW;
    END IF;
    IF pg_trigger_depth() <> 2
      OR NEW."storedBytes" <= OLD."storedBytes"
      OR NEW."artifactCount" <> OLD."artifactCount" + 1
      OR NEW."pendingJobCount" <> OLD."pendingJobCount"
      OR NEW."id" <> OLD."id" OR NEW."budgetBytes" <> OLD."budgetBytes"
      OR NEW."maxArtifacts" <> OLD."maxArtifacts" OR NEW."isEnabled" <> OLD."isEnabled"
      OR NEW."version" <> OLD."version" THEN
      RAISE EXCEPTION 'Report export counters require an artifact insert';
    END IF;
    RETURN NEW;
  ELSIF NEW."id" <> OLD."id" OR NEW."version" <> OLD."version" + 1 THEN
    RAISE EXCEPTION 'Report export capacity configuration requires its next version';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "ReportExportStorageCapacity_guard" BEFORE INSERT OR UPDATE OR DELETE
  ON "ReportExportStorageCapacity" FOR EACH ROW EXECUTE FUNCTION report_export_capacity_guard();

CREATE FUNCTION report_export_artifact_reserve() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE capacity "ReportExportStorageCapacity"%ROWTYPE;
BEGIN
  SELECT * INTO capacity FROM "ReportExportStorageCapacity" WHERE "id" = 'report-export' FOR UPDATE;
  IF NOT FOUND OR NOT capacity."isEnabled" THEN
    RAISE EXCEPTION 'Report export storage is not enabled';
  END IF;
  IF NEW."byteCount" < 1 OR NEW."byteCount" > 10485760
    OR capacity."artifactCount" >= capacity."maxArtifacts"
    OR NEW."byteCount" > capacity."budgetBytes" - capacity."storedBytes" THEN
    RAISE EXCEPTION 'Report export storage capacity exceeded';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "ReportExportJob" WHERE "id" = NEW."jobId"
    AND "reportKind" = NEW."reportKind" AND "definitionHash" = NEW."definitionHash"
    AND "outputFormat" = NEW."outputFormat" AND "requestKeyHash" = NEW."jobRequestKeyHash") THEN
    RAISE EXCEPTION 'Report export immutable job does not match';
  END IF;
  IF EXISTS (SELECT 1 FROM "ReportExportStorageCapacity" WHERE "id" = 'report-export'
    AND "maxRetentionMs" < EXTRACT(EPOCH FROM (NEW."expiresAt" - CURRENT_TIMESTAMP))::bigint * 1000) THEN
    RAISE EXCEPTION 'Report export retention cap exceeded';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "ReportExportArtifact_reserve" BEFORE INSERT ON "ReportExportArtifact"
  FOR EACH ROW EXECUTE FUNCTION report_export_artifact_reserve();

-- Charge exactly one artifact insert; expiry cleanup frees it explicitly.
CREATE FUNCTION report_export_artifact_charge() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE "ReportExportStorageCapacity" SET
    "storedBytes" = "storedBytes" + NEW."byteCount",
    "artifactCount" = "artifactCount" + 1 WHERE "id" = 'report-export';
  RETURN NEW;
END;
$$;
CREATE TRIGGER "ReportExportArtifact_charge" AFTER INSERT ON "ReportExportArtifact"
  FOR EACH ROW EXECUTE FUNCTION report_export_artifact_charge();

-- Export artifacts are immutable, until their retention moment frees the
-- bytes: only a cleanup session (with SET LOCAL, see capacity guard) may
-- DELETE, and identity never changes.
CREATE FUNCTION report_export_artifact_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE cleanup_mode TEXT;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'Report export artifact identity is immutable';
  END IF;
  cleanup_mode := coalesce(current_setting('app.report_export_cleanup', true), '');
  IF cleanup_mode <> 'on' THEN
    RAISE EXCEPTION 'Report export artifact bytes require an expired cleanup session';
  END IF;
  RETURN OLD;
END;
$$;
CREATE TRIGGER "ReportExportArtifact_guard" BEFORE UPDATE OR DELETE
  ON "ReportExportArtifact" FOR EACH ROW EXECUTE FUNCTION report_export_artifact_guard();
COMMIT;
