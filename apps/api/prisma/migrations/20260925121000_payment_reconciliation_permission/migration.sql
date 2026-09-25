-- Register the privileged manual payment recheck in every environment.
-- Existing operator-managed permission definitions and revoked grants are preserved.
INSERT INTO "Permission" ("id", "key", "name", "description", "group", "isActive", "createdAt", "updatedAt")
VALUES (
  'migration_permission_payments_reconcile',
  'payments.reconcile',
  'Recheck unconfirmed payments',
  'Manually re-query an unconfirmed payment at the gateway.',
  'payments',
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
    'migration_grant_payments_reconcile_system_admin',
    role."id",
    permission."id",
    CURRENT_TIMESTAMP
  FROM "Role" AS role
  JOIN "Permission" AS permission ON permission."key" = 'payments.reconcile'
  WHERE role."key" = 'system-admin'
    AND role."isSystem" = true
  ON CONFLICT ("roleId", "permissionId") DO NOTHING
  RETURNING "roleId", "permissionId"
)
INSERT INTO "AuditLog" ("id", "action", "entityType", "entityId", "metadata", "createdAt")
SELECT
  'migration_audit_payments_reconcile_grant',
  'role.permission.granted',
  'Role',
  "roleId",
  jsonb_build_object('permissionId', "permissionId", 'source', '20260925121000_payment_reconciliation_permission'),
  CURRENT_TIMESTAMP
FROM inserted_grant;

INSERT INTO "AuditLog" ("id", "action", "entityType", "entityId", "metadata", "createdAt")
SELECT
  'migration_audit_payments_reconcile',
  'permission.registered',
  'Permission',
  permission."id",
  '{"source":"20260925121000_payment_reconciliation_permission"}'::jsonb,
  CURRENT_TIMESTAMP
FROM "Permission" AS permission
WHERE permission."key" = 'payments.reconcile'
ON CONFLICT ("id") DO NOTHING;
