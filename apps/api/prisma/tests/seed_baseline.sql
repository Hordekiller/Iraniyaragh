\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  expected_permission_keys text[] := ARRAY[
    'audit.read',
    'catalog.read',
    'catalog.write',
    'customers.manage',
    'customers.read',
    'inventory.adjust',
    'inventory.read',
    'inventory.transfer',
    'orders.manage',
    'orders.read',
    'payments.read',
    'payments.refund',
    'pricing.read',
    'pricing.write',
    'reports.read',
    'roles.manage',
    'settings.manage',
    'shipments.manage',
    'shipments.read',
    'users.manage'
  ];
  system_role_id text;
BEGIN
  SELECT "id"
    INTO system_role_id
    FROM "Role"
   WHERE "key" = 'system-admin'
     AND "isSystem" = true
     AND "isActive" = true;

  IF system_role_id IS NULL THEN
    RAISE EXCEPTION 'Deterministic system-admin role is missing or inactive';
  END IF;

  IF (
    SELECT array_agg("key"::text ORDER BY "key")
      FROM "Permission"
     WHERE "key" = ANY(expected_permission_keys)
       AND "isActive" = true
  ) IS DISTINCT FROM expected_permission_keys THEN
    RAISE EXCEPTION 'Canonical active permission registry does not match the seed contract';
  END IF;

  IF (
    SELECT count(*)
      FROM "RolePermission" role_permission
      JOIN "Permission" permission ON permission."id" = role_permission."permissionId"
     WHERE role_permission."roleId" = system_role_id
       AND permission."key" = ANY(expected_permission_keys)
       AND role_permission."revokedAt" IS NULL
  ) <> cardinality(expected_permission_keys) THEN
    RAISE EXCEPTION 'system-admin does not own every canonical active permission';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM "UserRole"
     WHERE "roleId" = system_role_id
  ) THEN
    RAISE EXCEPTION 'Development seed must not create or assign a default privileged user';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM "AuditLog"
     WHERE "id" = 'seed_audit_rbac_baseline'
       AND "action" = 'seed.rbac.baseline'
       AND "entityId" = system_role_id
  ) THEN
    RAISE EXCEPTION 'Seed bootstrap audit marker is missing';
  END IF;
END $$;

ROLLBACK;
