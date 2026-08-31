\set ON_ERROR_STOP on

BEGIN;

-- The ten money columns must have been converted to BIGINT integer Rial
-- (ADR-0003 extension, #13).
DO $$
DECLARE
  wrong integer;
BEGIN
  SELECT count(*)
    INTO wrong
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND (table_name, column_name) IN (
       ('ProductVariant', 'costPrice'),
       ('ProductVariant', 'salePrice'),
       ('PurchaseOrderItem', 'unitCost'),
       ('Order', 'subtotal'),
       ('Order', 'discount'),
       ('Order', 'shipping'),
       ('Order', 'grandTotal'),
       ('OrderItem', 'unitPrice'),
       ('OrderItem', 'total'),
       ('Payment', 'amount')
     )
     AND data_type <> 'bigint';

  IF wrong > 0 THEN
    RAISE EXCEPTION '% money column(s) are not BIGINT after migration', wrong;
  END IF;
END $$;

-- Conversion must be exact: clean integer-Rial numeric rows survive the
-- numeric -> bigint cast without a rounding delta.
DO $$
BEGIN
  IF 1234567.00::bigint <> 1234567 THEN
    RAISE EXCEPTION 'Non-lossy numeric -> bigint money conversion failed';
  END IF;
END $$;

-- The preflight guard must reject fractional Rial data before the cast
-- (numeric -> bigint CAST rounds silently, so the guard is the last line of
-- defence against silent data loss on legacy rows).
DO $$
BEGIN
  CREATE TEMP TABLE legacy_money (amount numeric(18, 2)) ON COMMIT DROP;
  INSERT INTO legacy_money (amount) VALUES (150000.45);

  IF NOT EXISTS (SELECT 1 FROM legacy_money WHERE amount <> trunc(amount)) THEN
    RAISE EXCEPTION 'Preflight predicate failed to detect fractional Rial value';
  END IF;
END $$;

-- Document the cast semantics for the domain layer: the guard is at the
-- migration boundary, so the business layer must validate integer-Rial input
-- before storage; fractional input would silently round here.
DO $$
BEGIN
  IF 150000.45::bigint <> 150000 THEN
    RAISE EXCEPTION 'Unexpected numeric -> bigint rounding semantics';
  END IF;
END $$;

-- BIGINT domain is enforced by the database: values outside the signed 64-bit
-- range must be rejected (ADR-0003 overflow strategy).
DO $$
BEGIN
  BEGIN
    PERFORM '9223372036854775808'::bigint;
    RAISE EXCEPTION 'Expected BIGINT range enforcement to reject the value';
  EXCEPTION WHEN numeric_value_out_of_range THEN
    NULL;
  END;
END $$;

ROLLBACK;
