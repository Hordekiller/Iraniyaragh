-- Forward-only access administration: role concurrency, durable command replay
-- and the canonical roles.manage capability on already-provisioned databases.
BEGIN;

ALTER TABLE "Role" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE "AccessCommandRecord" (
  "id" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "scope" VARCHAR(160) NOT NULL,
  "keyHash" CHAR(64) NOT NULL,
  "requestHash" CHAR(64) NOT NULL,
  "response" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AccessCommandRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AccessCommandRecord_actorId_scope_keyHash_key"
  ON "AccessCommandRecord" ("actorId", "scope", "keyHash");
CREATE INDEX "AccessCommandRecord_createdAt_idx" ON "AccessCommandRecord" ("createdAt");

ALTER TABLE "AccessCommandRecord"
  ADD CONSTRAINT "AccessCommandRecord_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Register the access-administration permission when the canonical baseline has
-- not been applied yet. Existing rows (including an operator's definition) are
-- preserved; this never revives a revoked grant.
INSERT INTO "Permission" ("id", "key", "name", "description", "group", "isActive", "createdAt", "updatedAt")
VALUES (
  'migration_permission_roles_manage',
  'roles.manage',
  'Manage roles and access',
  'Create and edit roles, assign permissions and manage staff membership.',
  'roles',
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO NOTHING;

WITH inserted_grant AS (
  INSERT INTO "RolePermission" ("id", "roleId", "permissionId", "grantedAt")
  SELECT
    'migration_grant_roles_manage_system_admin',
    role."id",
    permission."id",
    CURRENT_TIMESTAMP
  FROM "Role" AS role
  JOIN "Permission" AS permission ON permission."key" = 'roles.manage'
  WHERE role."key" = 'system-admin'
    AND role."isSystem" = true
  ON CONFLICT ("roleId", "permissionId") DO NOTHING
  RETURNING "roleId", "permissionId"
)
INSERT INTO "AuditLog" ("id", "action", "entityType", "entityId", "metadata", "createdAt")
SELECT
  'migration_audit_roles_manage_grant',
  'role.permission.granted',
  'Role',
  "roleId",
  jsonb_build_object('permissionId', "permissionId", 'source', '20261026140000_access_administration'),
  CURRENT_TIMESTAMP
FROM inserted_grant;

COMMIT;
