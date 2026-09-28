ALTER TABLE "PurchaseOrder" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_version_nonnegative_check" CHECK ("version" >= 0);
ALTER TABLE "PurchaseOrderItem" ADD CONSTRAINT "PurchaseOrderItem_quantity_bounds_check" CHECK ("orderedQty" > 0 AND "receivedQty" >= 0 AND "receivedQty" <= "orderedQty");
ALTER TABLE "PurchaseOrderItem" ADD CONSTRAINT "PurchaseOrderItem_unit_cost_positive_check" CHECK ("unitCost" > 0);

CREATE TABLE "PurchaseOrderCommandRecord" (
  "id" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "scope" VARCHAR(100) NOT NULL,
  "keyHash" CHAR(64) NOT NULL,
  "payloadHash" CHAR(64) NOT NULL,
  "response" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PurchaseOrderCommandRecord_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PurchaseOrderCommandRecord_actorId_scope_keyHash_key" ON "PurchaseOrderCommandRecord"("actorId", "scope", "keyHash");
ALTER TABLE "PurchaseOrderCommandRecord" ADD CONSTRAINT "PurchaseOrderCommandRecord_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "Permission" ("id", "key", "name", "description", "group", "isActive", "createdAt", "updatedAt")
VALUES
  ('migration_permission_purchasing_read', 'purchasing.read', 'Read purchase orders', 'Read purchase orders and lifecycle history.', 'purchasing', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('migration_permission_purchasing_manage', 'purchasing.manage', 'Manage purchase orders', 'Create, edit draft and cancel purchase orders.', 'purchasing', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('migration_permission_purchasing_approve', 'purchasing.approve', 'Approve purchase orders', 'Approve a reviewed purchase order for receipt.', 'purchasing', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "AuditLog" ("id", "action", "entityType", "entityId", "metadata", "createdAt")
SELECT 'migration_audit_register_' || replace(permission."key", '.', '_'),
  'permission.registered', 'Permission', permission."id",
  '{"source":"20260928120000_purchase_order_commands"}'::jsonb, CURRENT_TIMESTAMP
FROM "Permission" AS permission
WHERE permission."key" IN ('purchasing.read', 'purchasing.manage', 'purchasing.approve')
ON CONFLICT ("id") DO NOTHING;

-- Existing system administrators receive new permissions; all other role grants
-- require an explicit operator action. Revoked grants are not resurrected.
WITH inserted_grants AS (
  INSERT INTO "RolePermission" ("id", "roleId", "permissionId", "grantedAt")
  SELECT 'migration_grant_' || replace(permission."key", '.', '_') || '_system_admin', role."id", permission."id", CURRENT_TIMESTAMP
  FROM "Role" AS role
  CROSS JOIN "Permission" AS permission
  WHERE role."key" = 'system-admin' AND role."isSystem" = true
    AND permission."key" IN ('purchasing.read', 'purchasing.manage', 'purchasing.approve')
  ON CONFLICT ("roleId", "permissionId") DO NOTHING
  RETURNING "roleId", "permissionId"
)
INSERT INTO "AuditLog" ("id", "action", "entityType", "entityId", "metadata", "createdAt")
SELECT 'migration_audit_grant_' || "permissionId" || '_' || "roleId", 'role.permission.granted', 'Role', "roleId",
  jsonb_build_object('permissionId', "permissionId", 'source', '20260928120000_purchase_order_commands'), CURRENT_TIMESTAMP
FROM inserted_grants;
