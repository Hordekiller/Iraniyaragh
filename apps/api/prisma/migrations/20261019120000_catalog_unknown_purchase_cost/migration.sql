SET lock_timeout = '5s';
SET statement_timeout = '30s';

ALTER TABLE "ProductVariant"
  ALTER COLUMN "costPrice" DROP NOT NULL;

ALTER TABLE "VariantPriceRecord"
  ALTER COLUMN "costPrice" DROP NOT NULL;

RESET lock_timeout;
RESET statement_timeout;
