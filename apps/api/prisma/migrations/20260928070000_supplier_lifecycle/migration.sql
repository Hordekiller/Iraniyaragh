ALTER TABLE "Supplier" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_version_nonnegative_check" CHECK ("version" >= 0);

CREATE TABLE "SupplierCommandRecord" (
  "id" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "scope" VARCHAR(80) NOT NULL,
  "keyHash" CHAR(64) NOT NULL,
  "payloadHash" CHAR(64) NOT NULL,
  "response" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupplierCommandRecord_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SupplierCommandRecord_actorId_scope_keyHash_key" ON "SupplierCommandRecord"("actorId", "scope", "keyHash");
ALTER TABLE "SupplierCommandRecord" ADD CONSTRAINT "SupplierCommandRecord_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "Permission" ("id", "key", "name", "description", "group", "isActive", "createdAt", "updatedAt")
VALUES
  ('migration_permission_suppliers_read', 'suppliers.read', 'Read suppliers', 'Read supplier records and audit history.', 'suppliers', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('migration_permission_suppliers_manage', 'suppliers.manage', 'Manage suppliers', 'Create, update and deactivate suppliers.', 'suppliers', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "AuditLog" ("id", "action", "entityType", "entityId", "metadata", "createdAt")
SELECT 'migration_audit_register_' || replace(permission."key", '.', '_'),
  'permission.registered', 'Permission', permission."id",
  '{"source":"20260928070000_supplier_lifecycle"}'::jsonb, CURRENT_TIMESTAMP
FROM "Permission" AS permission
WHERE permission."key" IN ('suppliers.read', 'suppliers.manage')
ON CONFLICT ("id") DO NOTHING;

-- Only the pre-existing system administrator receives these capabilities automatically.
-- Operator roles must be granted deliberately; revoked grants remain revoked.
WITH inserted_grants AS (
  INSERT INTO "RolePermission" ("id", "roleId", "permissionId", "grantedAt")
  SELECT 'migration_grant_' || replace(permission."key", '.', '_') || '_system_admin', role."id", permission."id", CURRENT_TIMESTAMP
  FROM "Role" AS role
  CROSS JOIN "Permission" AS permission
  WHERE role."key" = 'system-admin' AND role."isSystem" = true
    AND permission."key" IN ('suppliers.read', 'suppliers.manage')
  ON CONFLICT ("roleId", "permissionId") DO NOTHING
  RETURNING "roleId", "permissionId"
)
INSERT INTO "AuditLog" ("id", "action", "entityType", "entityId", "metadata", "createdAt")
SELECT 'migration_audit_grant_' || replace("permissionId", '.', '_') || '_' || "roleId", 'role.permission.granted', 'Role', "roleId",
  jsonb_build_object('permissionId', "permissionId", 'source', '20260928070000_supplier_lifecycle'), CURRENT_TIMESTAMP
FROM inserted_grants;
