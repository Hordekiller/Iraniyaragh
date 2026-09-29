CREATE TABLE "PurchaseReceipt" (
  "id" TEXT NOT NULL,
  "number" TEXT NOT NULL,
  "purchaseOrderId" TEXT NOT NULL,
  "warehouseId" TEXT NOT NULL,
  "externalReference" VARCHAR(120) NOT NULL,
  "actorId" TEXT NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PurchaseReceipt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PurchaseReceipt_external_reference_nonempty_check" CHECK (length(btrim("externalReference")) > 0)
);
CREATE UNIQUE INDEX "PurchaseReceipt_number_key" ON "PurchaseReceipt"("number");
CREATE UNIQUE INDEX "PurchaseReceipt_purchaseOrderId_externalReference_key" ON "PurchaseReceipt"("purchaseOrderId", "externalReference");
CREATE INDEX "PurchaseReceipt_purchaseOrderId_receivedAt_idx" ON "PurchaseReceipt"("purchaseOrderId", "receivedAt");
ALTER TABLE "PurchaseReceipt" ADD CONSTRAINT "PurchaseReceipt_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseReceipt" ADD CONSTRAINT "PurchaseReceipt_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseReceipt" ADD CONSTRAINT "PurchaseReceipt_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "PurchaseReceiptLine" (
  "id" TEXT NOT NULL,
  "receiptId" TEXT NOT NULL,
  "purchaseOrderItemId" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "movementId" TEXT NOT NULL,
  CONSTRAINT "PurchaseReceiptLine_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PurchaseReceiptLine_quantity_positive_check" CHECK ("quantity" > 0)
);
CREATE UNIQUE INDEX "PurchaseReceiptLine_movementId_key" ON "PurchaseReceiptLine"("movementId");
CREATE UNIQUE INDEX "PurchaseReceiptLine_receipt_item_location_key" ON "PurchaseReceiptLine"("receiptId", "purchaseOrderItemId", "locationId");
CREATE INDEX "PurchaseReceiptLine_purchaseOrderItemId_idx" ON "PurchaseReceiptLine"("purchaseOrderItemId");
ALTER TABLE "PurchaseReceiptLine" ADD CONSTRAINT "PurchaseReceiptLine_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "PurchaseReceipt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseReceiptLine" ADD CONSTRAINT "PurchaseReceiptLine_purchaseOrderItemId_fkey" FOREIGN KEY ("purchaseOrderItemId") REFERENCES "PurchaseOrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseReceiptLine" ADD CONSTRAINT "PurchaseReceiptLine_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "WarehouseLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseReceiptLine" ADD CONSTRAINT "PurchaseReceiptLine_movementId_fkey" FOREIGN KEY ("movementId") REFERENCES "InventoryMovement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "Permission" ("id", "key", "name", "description", "group", "isActive", "createdAt", "updatedAt")
VALUES ('migration_permission_purchasing_receive', 'purchasing.receive', 'Receive purchase orders', 'Record supplier goods receipts and inventory movements.', 'purchasing', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
INSERT INTO "AuditLog" ("id", "action", "entityType", "entityId", "metadata", "createdAt")
SELECT 'migration_audit_register_purchasing_receive', 'permission.registered', 'Permission', "id", '{"source":"20260929120000_purchase_receipts"}'::jsonb, CURRENT_TIMESTAMP
FROM "Permission" WHERE "key" = 'purchasing.receive' ON CONFLICT ("id") DO NOTHING;
WITH inserted_grants AS (
  INSERT INTO "RolePermission" ("id", "roleId", "permissionId", "grantedAt")
  SELECT 'migration_grant_purchasing_receive_system_admin', role."id", permission."id", CURRENT_TIMESTAMP
  FROM "Role" AS role CROSS JOIN "Permission" AS permission
  WHERE role."key" = 'system-admin' AND role."isSystem" = true AND permission."key" = 'purchasing.receive'
  ON CONFLICT ("roleId", "permissionId") DO NOTHING
  RETURNING "roleId", "permissionId"
)
INSERT INTO "AuditLog" ("id", "action", "entityType", "entityId", "metadata", "createdAt")
SELECT 'migration_audit_grant_' || "permissionId" || '_' || "roleId", 'role.permission.granted', 'Role', "roleId",
  jsonb_build_object('permissionId', "permissionId", 'source', '20260929120000_purchase_receipts'), CURRENT_TIMESTAMP
FROM inserted_grants;
