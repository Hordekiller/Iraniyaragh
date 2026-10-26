-- Forward-only: retain existing jobs, artifacts and audit history.
BEGIN;
ALTER TABLE "ReportExportStorageCapacity" ADD COLUMN "snapshotBytes" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "ReportExportStorageCapacity" ADD CONSTRAINT "ReportExportStorageCapacity_snapshot_bounds"
  CHECK ("snapshotBytes" >= 0 AND "storedBytes" + "snapshotBytes" <= "budgetBytes");
DROP INDEX "ReportExportJob_active_input_key";
-- Conflicting historical command keys require operator reconciliation, never deletion.
CREATE UNIQUE INDEX "ReportExportCommand_actor_key" ON "ReportExportCommand" ("actorId", "keyHash");
ALTER TABLE "ReportExportArtifact" ADD COLUMN "snapshotSha256" CHAR(64);
CREATE TABLE "ReportExportSnapshot" (
  "jobId" TEXT PRIMARY KEY REFERENCES "ReportExportJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "bytes" BYTEA NOT NULL,
  "sha256" CHAR(64) NOT NULL,
  "byteCount" INTEGER NOT NULL,
  "rowCount" INTEGER NOT NULL,
  "generatedAt" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReportExportSnapshot_bounds" CHECK (
    "byteCount" BETWEEN 1 AND 8388608 AND octet_length("bytes") = "byteCount"
    AND encode(sha256("bytes"), 'hex') = "sha256" AND "rowCount" BETWEEN 0 AND 20000)
);
CREATE INDEX "ReportExportSnapshot_expiresAt_idx" ON "ReportExportSnapshot"("expiresAt");

CREATE OR REPLACE FUNCTION report_export_capacity_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Report export capacity cannot be deleted'; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW."storedBytes" <> 0 OR NEW."snapshotBytes" <> 0 OR NEW."artifactCount" <> 0
      OR NEW."pendingJobCount" <> 0 OR NEW."version" <> 1 THEN
      RAISE EXCEPTION 'Report export capacity must start empty';
    END IF;
    RETURN NEW;
  END IF;
  IF (NEW."storedBytes", NEW."snapshotBytes", NEW."artifactCount") IS DISTINCT FROM
     (OLD."storedBytes", OLD."snapshotBytes", OLD."artifactCount") THEN
    IF (NEW."id", NEW."budgetBytes", NEW."maxArtifacts", NEW."maxPendingJobs", NEW."maxRetentionMs", NEW."isEnabled", NEW."version", NEW."pendingJobCount")
      IS DISTINCT FROM (OLD."id", OLD."budgetBytes", OLD."maxArtifacts", OLD."maxPendingJobs", OLD."maxRetentionMs", OLD."isEnabled", OLD."version", OLD."pendingJobCount") THEN
      RAISE EXCEPTION 'Storage counters cannot change configuration';
    END IF;
    IF current_setting('app.report_export_cleanup', true) = 'on'
      AND NEW."storedBytes" <= OLD."storedBytes" AND NEW."snapshotBytes" <= OLD."snapshotBytes"
      AND NEW."artifactCount" <= OLD."artifactCount" THEN RETURN NEW; END IF;
    IF pg_trigger_depth() = 2 AND (
      (NEW."snapshotBytes" > OLD."snapshotBytes" AND NEW."storedBytes" = OLD."storedBytes" AND NEW."artifactCount" = OLD."artifactCount")
      OR (NEW."storedBytes" > OLD."storedBytes" AND NEW."snapshotBytes" = OLD."snapshotBytes" AND NEW."artifactCount" = OLD."artifactCount" + 1)
    ) THEN RETURN NEW; END IF;
    RAISE EXCEPTION 'Storage counters require a bounded storage trigger';
  END IF;
  IF NEW."id" <> OLD."id" OR NEW."version" <> OLD."version" + 1 THEN
    RAISE EXCEPTION 'Capacity configuration requires its next version';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION report_export_snapshot_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE capacity "ReportExportStorageCapacity"%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' THEN RAISE EXCEPTION 'Report snapshots are immutable'; END IF;
  IF TG_OP = 'DELETE' THEN
    IF coalesce(current_setting('app.report_export_cleanup', true), '') <> 'on' OR OLD."expiresAt" > CURRENT_TIMESTAMP THEN
      RAISE EXCEPTION 'Only expired snapshots may be cleaned';
    END IF;
    UPDATE "ReportExportStorageCapacity" SET "snapshotBytes" = "snapshotBytes" - OLD."byteCount" WHERE id = 'report-export';
    RETURN OLD;
  END IF;
  SELECT * INTO capacity FROM "ReportExportStorageCapacity" WHERE id = 'report-export' FOR UPDATE;
  IF NOT FOUND OR NOT capacity."isEnabled" OR NEW."byteCount" > capacity."budgetBytes" - capacity."storedBytes" - capacity."snapshotBytes"
    OR NEW."expiresAt" <= CURRENT_TIMESTAMP
    OR EXTRACT(EPOCH FROM (NEW."expiresAt" - CURRENT_TIMESTAMP)) * 1000 > capacity."maxRetentionMs" THEN
    RAISE EXCEPTION 'Report snapshot exceeds approved storage policy';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "ReportExportJob" WHERE id = NEW."jobId" AND status = 'RUNNING' AND "leaseExpireAt" > CURRENT_TIMESTAMP) THEN
    RAISE EXCEPTION 'Report snapshot requires a current running lease';
  END IF;
  UPDATE "ReportExportStorageCapacity" SET "snapshotBytes" = "snapshotBytes" + NEW."byteCount" WHERE id = 'report-export';
  RETURN NEW;
END;
$$;
CREATE TRIGGER "ReportExportSnapshot_guard" BEFORE INSERT OR UPDATE OR DELETE ON "ReportExportSnapshot"
  FOR EACH ROW EXECUTE FUNCTION report_export_snapshot_guard();

CREATE OR REPLACE FUNCTION report_export_artifact_reserve() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE capacity "ReportExportStorageCapacity"%ROWTYPE;
BEGIN
  SELECT * INTO capacity FROM "ReportExportStorageCapacity" WHERE id = 'report-export' FOR UPDATE;
  IF NOT FOUND OR NOT capacity."isEnabled" OR capacity."artifactCount" >= capacity."maxArtifacts"
    OR NEW."byteCount" > capacity."budgetBytes" - capacity."storedBytes" - capacity."snapshotBytes" THEN
    RAISE EXCEPTION 'Report export storage capacity exceeded or disabled';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "ReportExportJob" j JOIN "ReportExportSnapshot" s ON s."jobId" = j.id
    WHERE j.id = NEW."jobId" AND j.status = 'RUNNING' AND j."leaseExpireAt" > CURRENT_TIMESTAMP
    AND j."reportKind" = NEW."reportKind" AND j."definitionHash" = NEW."definitionHash"
    AND j."outputFormat" = NEW."outputFormat" AND j."requestKeyHash" = NEW."jobRequestKeyHash"
    AND j."rendererRevision" = NEW."rendererRevision" AND s.sha256 = NEW."snapshotSha256"
    AND NEW."expiresAt" = s."expiresAt" AND s."expiresAt" > CURRENT_TIMESTAMP) THEN
    RAISE EXCEPTION 'Report artifact requires its immutable snapshot and current lease';
  END IF;
  RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION report_export_artifact_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' OR coalesce(current_setting('app.report_export_cleanup', true), '') <> 'on'
    OR OLD."expiresAt" > CURRENT_TIMESTAMP THEN RAISE EXCEPTION 'Only expired artifacts may be cleaned'; END IF;
  RETURN OLD;
END;
$$;
-- Register the privileged manual refund command in every environment.
-- Existing operator-managed permission definitions and revoked grants are preserved.
INSERT INTO "Permission" ("id", "key", "name", "description", "group", "isActive", "createdAt", "updatedAt")
VALUES (
  'migration_permission_reports_export',
  'reports.export',
  'Export reports',
  'Download private immutable operational report snapshots.',
  'reports',
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO NOTHING;

-- A pre-existing system-admin role receives the new capability. Other roles
-- require an explicit operator grant; this does not revive a revoked grant.
WITH inserted_grant AS (
  INSERT INTO "RolePermission" ("id", "roleId", "permissionId", "grantedAt")
  SELECT
    'migration_grant_reports_export_system_admin',
    role."id",
    permission."id",
    CURRENT_TIMESTAMP
  FROM "Role" AS role
  JOIN "Permission" AS permission ON permission."key" = 'reports.export'
  WHERE role."key" = 'system-admin'
    AND role."isSystem" = true
  ON CONFLICT ("roleId", "permissionId") DO NOTHING
  RETURNING "roleId", "permissionId"
)
INSERT INTO "AuditLog" ("id", "action", "entityType", "entityId", "metadata", "createdAt")
SELECT
  'migration_audit_reports_export_grant',
  'role.permission.granted',
  'Role',
  "roleId",
  jsonb_build_object('permissionId', "permissionId", 'source', '20261026120000_report_snapshot_integrity'),
  CURRENT_TIMESTAMP
FROM inserted_grant;

INSERT INTO "AuditLog" ("id", "action", "entityType", "entityId", "metadata", "createdAt")
SELECT
  'migration_audit_reports_export',
  'permission.registered',
  'Permission',
  permission."id",
  '{"source":"20261026120000_report_snapshot_integrity"}'::jsonb,
  CURRENT_TIMESTAMP
FROM "Permission" AS permission
WHERE permission."key" = 'reports.export'
ON CONFLICT ("id") DO NOTHING;

COMMIT;
