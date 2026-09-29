-- Staff-managed customer records (#349).
-- Forward-only migration. Existing migrations are never edited.
--
-- Design notes:
--  * Deactivation is a status column, not a delete: historical orders, payments
--    and ledger rows must stay referable to the customer they belonged to.
--  * `version` carries optimistic concurrency for staff edits.
--  * Notes are append-only rows with an explicit visibility, so an internal note
--    cannot be published by accident and a customer-visible note is auditable.
--  * Addresses are reusable staff data; orders keep their own immutable
--    addressSnapshot, so editing an address never rewrites order history.

CREATE TYPE "CustomerStatus" AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE "CustomerNoteVisibility" AS ENUM ('INTERNAL', 'CUSTOMER_VISIBLE');

ALTER TABLE "Customer"
  ADD COLUMN "status" "CustomerStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "deactivatedAt" TIMESTAMP(3),
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Customer" ADD CONSTRAINT "Customer_version_nonnegative_check" CHECK ("version" >= 0);

-- A deactivated customer must carry the moment it happened; a reactivated
-- customer must not keep a stale timestamp. Enforced in the database so a
-- future code path cannot produce an inconsistent lifecycle row.
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_deactivation_consistent_check" CHECK (
  ("status" = 'INACTIVE' AND "deactivatedAt" IS NOT NULL)
  OR ("status" = 'ACTIVE' AND "deactivatedAt" IS NULL)
);

CREATE TABLE "CustomerAddress" (
  "id" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "label" VARCHAR(60) NOT NULL,
  "receiverName" VARCHAR(120) NOT NULL,
  "mobile" VARCHAR(20) NOT NULL,
  "provinceCode" VARCHAR(16) NOT NULL,
  "city" VARCHAR(80) NOT NULL,
  "addressLine" VARCHAR(400) NOT NULL,
  "postalCode" VARCHAR(20),
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomerAddress_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CustomerAddress_customerId_idx" ON "CustomerAddress"("customerId");
ALTER TABLE "CustomerAddress" ADD CONSTRAINT "CustomerAddress_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- At most one default address per customer.
CREATE UNIQUE INDEX "CustomerAddress_one_default_per_customer_key" ON "CustomerAddress"("customerId") WHERE "isDefault" = true;

CREATE TABLE "CustomerNote" (
  "id" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "visibility" "CustomerNoteVisibility" NOT NULL,
  "body" VARCHAR(2000) NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerNote_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CustomerNote_body_not_blank_check" CHECK (length(btrim("body")) > 0)
);
CREATE INDEX "CustomerNote_customerId_createdAt_idx" ON "CustomerNote"("customerId", "createdAt");
ALTER TABLE "CustomerNote" ADD CONSTRAINT "CustomerNote_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerNote" ADD CONSTRAINT "CustomerNote_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "CustomerCommandRecord" (
  "id" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "scope" VARCHAR(80) NOT NULL,
  "keyHash" CHAR(64) NOT NULL,
  "payloadHash" CHAR(64) NOT NULL,
  "response" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerCommandRecord_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CustomerCommandRecord_actorId_scope_keyHash_key" ON "CustomerCommandRecord"("actorId", "scope", "keyHash");
ALTER TABLE "CustomerCommandRecord" ADD CONSTRAINT "CustomerCommandRecord_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- customers.read / customers.manage are already present in the seeded
-- permission registry. Registering them here as well keeps the migration
-- self-sufficient on a database that was created before those seeds existed.
INSERT INTO "Permission" ("id", "key", "name", "description", "group", "isActive", "createdAt", "updatedAt")
VALUES
  ('migration_permission_customers_read', 'customers.read', 'Read customers', 'Read customer records, addresses, notes and order history.', 'customers', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('migration_permission_customers_manage', 'customers.manage', 'Manage customers', 'Create, update, deactivate customers and maintain their addresses and notes.', 'customers', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "AuditLog" ("id", "action", "entityType", "entityId", "metadata", "createdAt")
SELECT 'migration_audit_register_' || replace(permission."key", '.', '_'),
  'permission.registered', 'Permission', permission."id",
  '{"source":"20260929150000_customer_admin_records"}'::jsonb, CURRENT_TIMESTAMP
FROM "Permission" AS permission
WHERE permission."key" IN ('customers.read', 'customers.manage')
ON CONFLICT ("id") DO NOTHING;

-- Only the pre-existing system administrator receives these capabilities automatically.
-- Operator roles must be granted deliberately; revoked grants remain revoked.
WITH inserted_grants AS (
  INSERT INTO "RolePermission" ("id", "roleId", "permissionId", "grantedAt")
  SELECT 'migration_grant_' || replace(permission."key", '.', '_') || '_system_admin', role."id", permission."id", CURRENT_TIMESTAMP
  FROM "Role" AS role
  CROSS JOIN "Permission" AS permission
  WHERE role."key" = 'system-admin' AND role."isSystem" = true
    AND permission."key" IN ('customers.read', 'customers.manage')
  ON CONFLICT ("roleId", "permissionId") DO NOTHING
  RETURNING "permissionId"
)
INSERT INTO "AuditLog" ("id", "action", "entityType", "entityId", "metadata", "createdAt")
SELECT 'migration_audit_grant_' || replace(permission."key", '.', '_') || '_system_admin',
  'permission.granted', 'Permission', permission."id",
  jsonb_build_object('roleKey', 'system-admin', 'source', '20260929150000_customer_admin_records'),
  CURRENT_TIMESTAMP
FROM inserted_grants
JOIN "Permission" AS permission ON permission."id" = inserted_grants."permissionId"
ON CONFLICT ("id") DO NOTHING;
