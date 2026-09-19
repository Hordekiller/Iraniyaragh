ALTER TABLE "StockTransfer"
ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "StockTransfer"
ADD CONSTRAINT "StockTransfer_version_nonnegative" CHECK ("version" >= 0);
