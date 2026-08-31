-- Forward migration: convert the ten Decimal(18, 2) money columns to BIGINT
-- integer Rial (ADR-0003 extension, #13).
--
-- The integer-Rial convention stores money as a plain integer amount. Before
-- any type change, every existing Rial value must be an exact integer:
-- numeric -> bigint CAST rounds silently, so untouched fractional data would be
-- lost. The preflight below raises instead. All checks and alters happen inside
-- this single migration transaction.

DO $$
DECLARE
  offending text;
BEGIN
  SELECT string_agg(col, ', ' ORDER BY col)
    INTO offending
    FROM (
      SELECT 'ProductVariant.costPrice' AS col FROM "ProductVariant" WHERE "costPrice" <> trunc("costPrice")
      UNION ALL
      SELECT 'ProductVariant.salePrice' FROM "ProductVariant" WHERE "salePrice" <> trunc("salePrice")
      UNION ALL
      SELECT 'PurchaseOrderItem.unitCost' FROM "PurchaseOrderItem" WHERE "unitCost" <> trunc("unitCost")
      UNION ALL
      SELECT 'Order.subtotal' FROM "Order" WHERE "subtotal" <> trunc("subtotal")
      UNION ALL
      SELECT 'Order.discount' FROM "Order" WHERE "discount" <> trunc("discount")
      UNION ALL
      SELECT 'Order.shipping' FROM "Order" WHERE "shipping" <> trunc("shipping")
      UNION ALL
      SELECT 'Order.grandTotal' FROM "Order" WHERE "grandTotal" <> trunc("grandTotal")
      UNION ALL
      SELECT 'OrderItem.unitPrice' FROM "OrderItem" WHERE "unitPrice" <> trunc("unitPrice")
      UNION ALL
      SELECT 'OrderItem.total' FROM "OrderItem" WHERE "total" <> trunc("total")
      UNION ALL
      SELECT 'Payment.amount' FROM "Payment" WHERE "amount" <> trunc("amount")
    ) found_offenders;

  IF offending IS NOT NULL THEN
    RAISE EXCEPTION
      'Cannot convert Decimal(18,2) money columns to BIGINT: fractional Rial values present in: %', offending;
  END IF;
END $$;

-- Cast only after the preflight passes (single migration transaction).
ALTER TABLE "ProductVariant"  ALTER COLUMN "costPrice"  SET DATA TYPE BIGINT USING "costPrice"::bigint;
ALTER TABLE "ProductVariant"  ALTER COLUMN "salePrice"  SET DATA TYPE BIGINT USING "salePrice"::bigint;
ALTER TABLE "PurchaseOrderItem" ALTER COLUMN "unitCost" SET DATA TYPE BIGINT USING "unitCost"::bigint;
ALTER TABLE "Order"          ALTER COLUMN "subtotal"   SET DATA TYPE BIGINT USING "subtotal"::bigint;
ALTER TABLE "Order"          ALTER COLUMN "discount"   SET DATA TYPE BIGINT USING "discount"::bigint;
ALTER TABLE "Order"          ALTER COLUMN "shipping"   SET DATA TYPE BIGINT USING "shipping"::bigint;
ALTER TABLE "Order"          ALTER COLUMN "grandTotal" SET DATA TYPE BIGINT USING "grandTotal"::bigint;
ALTER TABLE "OrderItem"      ALTER COLUMN "unitPrice"  SET DATA TYPE BIGINT USING "unitPrice"::bigint;
ALTER TABLE "OrderItem"      ALTER COLUMN "total"      SET DATA TYPE BIGINT USING "total"::bigint;
ALTER TABLE "Payment"        ALTER COLUMN "amount"     SET DATA TYPE BIGINT USING "amount"::bigint;
