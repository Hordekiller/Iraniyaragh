-- Stocktake becomes a ledger-backed count session.
--
-- The pre-existing "Stocktake"/"StocktakeItem" tables were never exposed through
-- any API, Admin screen or seed, so they are expected to be empty. The guards
-- below fail loudly instead of inventing a system actor, because every count
-- line must be attributable to a real staff member.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Stocktake") THEN
    RAISE EXCEPTION 'Stocktake table is not empty; stocktake count sessions must be created through the API with a real actor.';
  END IF;
  IF EXISTS (SELECT 1 FROM "StocktakeItem") THEN
    RAISE EXCEPTION 'StocktakeItem table is not empty; stocktake count lines must be created through the API with a real actor.';
  END IF;
END $$;

CREATE TYPE "StocktakeScopeType" AS ENUM ('WAREHOUSE', 'LOCATIONS', 'VARIANTS');

ALTER TABLE "Stocktake" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Stocktake" ADD COLUMN "scopeType" "StocktakeScopeType" NOT NULL DEFAULT 'WAREHOUSE';
ALTER TABLE "Stocktake" ADD COLUMN "scope" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "Stocktake" ADD COLUMN "createdById" TEXT;
ALTER TABLE "Stocktake" ADD COLUMN "countedById" TEXT;
ALTER TABLE "Stocktake" ADD COLUMN "approvedById" TEXT;
ALTER TABLE "Stocktake" ADD COLUMN "startedAt" TIMESTAMP(3);
ALTER TABLE "Stocktake" ADD COLUMN "submittedAt" TIMESTAMP(3);
ALTER TABLE "Stocktake" ADD COLUMN "completedAt" TIMESTAMP(3);
ALTER TABLE "Stocktake" ADD COLUMN "cancelledAt" TIMESTAMP(3);

-- Count lines are keyed by (location, variant) because InventoryBalance — the
-- only place a physical quantity lives — is keyed by
-- (warehouse, location, variant). A warehouse-level line could never be applied
-- to the ledger.
ALTER TABLE "StocktakeItem" ADD COLUMN "locationId" TEXT;
ALTER TABLE "StocktakeItem" ADD COLUMN "countedAt" TIMESTAMP(3);
ALTER TABLE "StocktakeItem" ADD COLUMN "movementId" TEXT;
ALTER TABLE "StocktakeItem" ADD COLUMN "notes" TEXT;
ALTER TABLE "StocktakeItem" ADD COLUMN "countedById" TEXT;

ALTER TABLE "Stocktake" ALTER COLUMN "createdById" SET NOT NULL;

ALTER TABLE "StocktakeItem" ALTER COLUMN "locationId" SET NOT NULL;

DROP INDEX "StocktakeItem_stocktakeId_variantId_key";
CREATE UNIQUE INDEX "StocktakeItem_stocktake_location_variant_key" ON "StocktakeItem"("stocktakeId", "locationId", "variantId");
CREATE UNIQUE INDEX "StocktakeItem_movementId_key" ON "StocktakeItem"("movementId");
CREATE INDEX "StocktakeItem_variantId_idx" ON "StocktakeItem"("variantId");
CREATE INDEX "StocktakeItem_locationId_idx" ON "StocktakeItem"("locationId");
CREATE INDEX "Stocktake_status_createdAt_idx" ON "Stocktake"("status", "createdAt");

ALTER TABLE "Stocktake" ADD CONSTRAINT "Stocktake_version_nonnegative" CHECK ("version" >= 0);
ALTER TABLE "Stocktake" ADD CONSTRAINT "Stocktake_draft_has_no_progress" CHECK (("status"::text <> 'DRAFT') OR ("startedAt" IS NULL AND "submittedAt" IS NULL AND "completedAt" IS NULL AND "cancelledAt" IS NULL AND "countedById" IS NULL AND "approvedById" IS NULL));
ALTER TABLE "Stocktake" ADD CONSTRAINT "Stocktake_counting_started_not_submitted" CHECK (("status"::text <> 'COUNTING') OR ("startedAt" IS NOT NULL AND "submittedAt" IS NULL AND "completedAt" IS NULL AND "cancelledAt" IS NULL AND "approvedById" IS NULL));
ALTER TABLE "Stocktake" ADD CONSTRAINT "Stocktake_review_submitted_not_completed" CHECK (("status"::text <> 'REVIEW') OR ("startedAt" IS NOT NULL AND "submittedAt" IS NOT NULL AND "completedAt" IS NULL AND "cancelledAt" IS NULL AND "approvedById" IS NULL));
ALTER TABLE "Stocktake" ADD CONSTRAINT "Stocktake_completed_has_approver" CHECK (("status"::text <> 'COMPLETED') OR ("startedAt" IS NOT NULL AND "submittedAt" IS NOT NULL AND "completedAt" IS NOT NULL AND "cancelledAt" IS NULL AND "approvedById" IS NOT NULL));
ALTER TABLE "Stocktake" ADD CONSTRAINT "Stocktake_cancelled_has_timestamp" CHECK (("status"::text <> 'CANCELLED') OR ("cancelledAt" IS NOT NULL));

ALTER TABLE "StocktakeItem" ADD CONSTRAINT "StocktakeItem_expected_nonnegative" CHECK ("expectedQty" >= 0);
ALTER TABLE "StocktakeItem" ADD CONSTRAINT "StocktakeItem_counted_nonnegative" CHECK (("countedQty" IS NULL) OR ("countedQty" >= 0));
ALTER TABLE "StocktakeItem" ADD CONSTRAINT "StocktakeItem_count_requires_timestamp" CHECK (("countedQty" IS NULL) = ("countedAt" IS NULL));
-- `difference` is the variance the count found against the start-of-count
-- snapshot, so it can never drift from the two quantities it derives from.
ALTER TABLE "StocktakeItem" ADD CONSTRAINT "StocktakeItem_difference_matches_count" CHECK (("difference" IS NULL) OR ("countedQty" IS NOT NULL AND "difference" = "countedQty" - "expectedQty"));
-- A line is either uncounted or fully reconciled by a ledger movement.
ALTER TABLE "StocktakeItem" ADD CONSTRAINT "StocktakeItem_movement_requires_difference" CHECK (("movementId" IS NULL) OR ("difference" IS NOT NULL AND "difference" <> 0));

ALTER TABLE "Stocktake" ADD CONSTRAINT "Stocktake_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Stocktake" ADD CONSTRAINT "Stocktake_countedById_fkey" FOREIGN KEY ("countedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Stocktake" ADD CONSTRAINT "Stocktake_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StocktakeItem" ADD CONSTRAINT "StocktakeItem_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "WarehouseLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StocktakeItem" ADD CONSTRAINT "StocktakeItem_countedById_fkey" FOREIGN KEY ("countedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StocktakeItem" ADD CONSTRAINT "StocktakeItem_movementId_fkey" FOREIGN KEY ("movementId") REFERENCES "InventoryMovement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Mirrors PurchaseOrderCommandRecord so a replayed Idempotency-Key returns the
-- original response and a reused key with a different payload is rejected.
CREATE TABLE "StocktakeCommandRecord" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "scope" VARCHAR(100) NOT NULL,
    "keyHash" CHAR(64) NOT NULL,
    "payloadHash" CHAR(64) NOT NULL,
    "response" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StocktakeCommandRecord_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "StocktakeCommandRecord_actorId_scope_keyHash_key" ON "StocktakeCommandRecord"("actorId", "scope", "keyHash");
ALTER TABLE "StocktakeCommandRecord" ADD CONSTRAINT "StocktakeCommandRecord_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "Permission" ("id", "key", "name", "description", "group", "isActive", "createdAt", "updatedAt")
VALUES
  ('migration_permission_stocktake_read', 'stocktake.read', 'Read stocktakes', 'Read stocktake sessions and count lines.', 'stocktake', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('migration_permission_stocktake_manage', 'stocktake.manage', 'Manage stocktakes', 'Create stocktake sessions, start counting, submit for review and cancel.', 'stocktake', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('migration_permission_stocktake_count', 'stocktake.count', 'Record stocktake counts', 'Record blind count observations without seeing expected quantities.', 'stocktake', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('migration_permission_stocktake_approve', 'stocktake.approve', 'Approve stocktakes', 'Review count variances and approve the ledger corrections they create.', 'stocktake', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "AuditLog" ("id", "action", "entityType", "entityId", "metadata", "createdAt")
SELECT 'migration_audit_register_' || replace(permission."key", '.', '_'),
  'permission.registered', 'Permission', permission."id",
  '{"source":"20260929150000_stocktake_count_sessions"}'::jsonb, CURRENT_TIMESTAMP
FROM "Permission" AS permission
WHERE permission."key" IN ('stocktake.read', 'stocktake.manage', 'stocktake.count', 'stocktake.approve')
ON CONFLICT ("id") DO NOTHING;

-- Existing system administrators receive new permissions; all other role grants
-- require an explicit operator action. Revoked grants are not resurrected.
WITH inserted_grants AS (
  INSERT INTO "RolePermission" ("id", "roleId", "permissionId", "grantedAt")
  SELECT 'migration_grant_' || replace(permission."key", '.', '_') || '_system_admin', role."id", permission."id", CURRENT_TIMESTAMP
  FROM "Role" AS role
  CROSS JOIN "Permission" AS permission
  WHERE role."key" = 'system-admin' AND role."isSystem" = true
    AND permission."key" IN ('stocktake.read', 'stocktake.manage', 'stocktake.count', 'stocktake.approve')
  ON CONFLICT ("roleId", "permissionId") DO NOTHING
  RETURNING "roleId", "permissionId"
)
INSERT INTO "AuditLog" ("id", "action", "entityType", "entityId", "metadata", "createdAt")
SELECT 'migration_audit_grant_' || "permissionId" || '_' || "roleId", 'role.permission.granted', 'Role', "roleId",
  jsonb_build_object('permissionId', "permissionId", 'source', '20260929150000_stocktake_count_sessions'), CURRENT_TIMESTAMP
FROM inserted_grants;
