-- AlterTable: add transfer location fields and idempotency keys
ALTER TABLE "StockTransferItem" ADD COLUMN "sourceLocationId" TEXT;
ALTER TABLE "StockTransferItem" ADD COLUMN "targetLocationId" TEXT;
ALTER TABLE "StockTransferItem" ADD CONSTRAINT "StockTransferItem_quantity_positive" CHECK ("quantity" > 0);

CREATE TABLE "StockTransferTransition" (
  "id" TEXT NOT NULL,
  "transferId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "expectedVersion" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StockTransferTransition_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "StockTransferTransition_idempotencyKey_key" ON "StockTransferTransition"("idempotencyKey");
CREATE INDEX "StockTransferTransition_transferId_action_idx" ON "StockTransferTransition"("transferId", "action");
ALTER TABLE "StockTransferTransition" ADD CONSTRAINT "StockTransferTransition_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "StockTransfer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StockReservation" ADD COLUMN "idempotencyKey" TEXT;

ALTER TABLE "StockTransfer" ADD COLUMN "idempotencyKey" TEXT;

-- CreateIndex: unique idempotency keys
CREATE UNIQUE INDEX "StockReservation_idempotencyKey_key" ON "StockReservation"("idempotencyKey");
CREATE UNIQUE INDEX "StockTransfer_idempotencyKey_key" ON "StockTransfer"("idempotencyKey");

-- CreateIndex: transfer item location indexes
CREATE INDEX "StockTransferItem_sourceLocationId_idx" ON "StockTransferItem"("sourceLocationId");
CREATE INDEX "StockTransferItem_targetLocationId_idx" ON "StockTransferItem"("targetLocationId");

-- AddForeignKey
ALTER TABLE "StockTransferItem" ADD CONSTRAINT "StockTransferItem_sourceLocationId_fkey" FOREIGN KEY ("sourceLocationId") REFERENCES "WarehouseLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StockTransferItem" ADD CONSTRAINT "StockTransferItem_targetLocationId_fkey" FOREIGN KEY ("targetLocationId") REFERENCES "WarehouseLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
