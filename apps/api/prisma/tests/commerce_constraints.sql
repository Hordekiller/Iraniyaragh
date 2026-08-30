\set ON_ERROR_STOP on

BEGIN;

-- ---------------------------------------------------------------------
-- Seed minimal deterministic data for commerce constraint tests
-- ---------------------------------------------------------------------

INSERT INTO "Category" ("id", "name", "slug", "updatedAt")
VALUES ('commerce_test_category', 'Electronics', 'electronics', CURRENT_TIMESTAMP);

INSERT INTO "Product" ("id", "name", "slug", "status", "categoryId", "updatedAt")
VALUES (
  'commerce_test_product', 'Smart Phone', 'smart-phone', 'ACTIVE',
  'commerce_test_category', CURRENT_TIMESTAMP
);

INSERT INTO "Sku" ("id", "productId", "sku", "updatedAt")
VALUES ('commerce_test_sku', 'commerce_test_product', 'SP-BLACK-64', CURRENT_TIMESTAMP);

INSERT INTO "Price" ("id", "skuId", "type", "amount", "minQuantity", "updatedAt")
VALUES (
  'commerce_test_price', 'commerce_test_sku', 'BASE',
  1500000000, 1, CURRENT_TIMESTAMP
);

INSERT INTO "User" ("id", "mobile", "status", "updatedAt")
VALUES ('commerce_test_user', '+989111111111', 'ACTIVE', CURRENT_TIMESTAMP);

INSERT INTO "Cart" ("id", "userId", "updatedAt")
VALUES ('commerce_test_cart', 'commerce_test_user', CURRENT_TIMESTAMP);

INSERT INTO "CartItem" ("id", "cartId", "skuId", "quantity", "updatedAt")
VALUES ('commerce_test_cart_item', 'commerce_test_cart', 'commerce_test_sku', 2, CURRENT_TIMESTAMP);

INSERT INTO "Customer" ("id", "mobile", "updatedAt")
VALUES ('commerce_test_customer', '+989111111111', CURRENT_TIMESTAMP);

INSERT INTO "Order" (
  "id", "number", "customerId", "userId", "subtotal", "grandTotal", "updatedAt"
) VALUES (
  'commerce_test_order', 'ORD-1000', 'commerce_test_customer', 'commerce_test_user',
  3000000000, 3000000000, CURRENT_TIMESTAMP
);

INSERT INTO "OrderItem" (
  "id", "orderId", "skuId", "sku", "title", "quantity", "unitPrice", "total"
) VALUES (
  'commerce_test_order_item', 'commerce_test_order', 'commerce_test_sku',
  'SP-BLACK-64', 'Smart Phone', 2, 1500000000, 3000000000
);

INSERT INTO "Warehouse" ("id", "code", "name", "updatedAt")
VALUES ('commerce_test_wh', 'MAIN', 'Main Warehouse', CURRENT_TIMESTAMP);

INSERT INTO "WarehouseLocation" ("id", "warehouseId", "code", "updatedAt")
VALUES ('commerce_test_loc', 'commerce_test_wh', 'A-01', CURRENT_TIMESTAMP);

DO $$
BEGIN

  -- -----------------------------------------------------------------
  -- Money: Price.amount must be non-negative (integer Rial)
  -- -----------------------------------------------------------------
  BEGIN
    INSERT INTO "Price" ("id", "skuId", "type", "amount", "updatedAt")
    VALUES ('c_neg_price', 'commerce_test_sku', 'SALE', -100, CURRENT_TIMESTAMP);
    RAISE EXCEPTION 'Expected negative Price.amount to be rejected';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  -- -----------------------------------------------------------------
  -- Price.minQuantity must be >= 1
  -- -----------------------------------------------------------------
  BEGIN
    INSERT INTO "Price" ("id", "skuId", "type", "amount", "minQuantity", "updatedAt")
    VALUES ('c_zero_minqty', 'commerce_test_sku', 'SALE', 1000, 0, CURRENT_TIMESTAMP);
    RAISE EXCEPTION 'Expected zero Price.minQuantity to be rejected';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  -- -----------------------------------------------------------------
  -- CartItem.quantity must be > 0
  -- -----------------------------------------------------------------
  BEGIN
    INSERT INTO "CartItem" ("id", "cartId", "skuId", "quantity", "updatedAt")
    VALUES ('c_zero_qty', 'commerce_test_cart', 'commerce_test_sku', 0, CURRENT_TIMESTAMP);
    RAISE EXCEPTION 'Expected zero CartItem.quantity to be rejected';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  -- -----------------------------------------------------------------
  -- OrderItem.unitPrice must be non-negative
  -- -----------------------------------------------------------------
  BEGIN
    INSERT INTO "OrderItem" (
      "id", "orderId", "skuId", "sku", "title", "quantity", "unitPrice", "total"
    ) VALUES (
      'c_neg_unit', 'commerce_test_order', 'commerce_test_sku',
      'SP-BLACK-64', 'Smart Phone', 1, -1, 3000000000
    );
    RAISE EXCEPTION 'Expected negative OrderItem.unitPrice to be rejected';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  -- -----------------------------------------------------------------
  -- Order.grandTotal must be non-negative
  -- -----------------------------------------------------------------
  BEGIN
    INSERT INTO "Order" (
      "id", "number", "customerId", "subtotal", "grandTotal", "updatedAt"
    ) VALUES (
      'c_neg_total', 'ORD-NEG', 'commerce_test_customer', 0, -5, CURRENT_TIMESTAMP
    );
    RAISE EXCEPTION 'Expected negative Order.grandTotal to be rejected';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  -- -----------------------------------------------------------------
  -- Payment.amount must be > 0
  -- -----------------------------------------------------------------
  BEGIN
    INSERT INTO "Payment" (
      "id", "orderId", "provider", "amount", "idempotencyKey", "updatedAt"
    ) VALUES (
      'c_zero_pay', 'commerce_test_order', 'fake', 0, 'c_zero_pay_key', CURRENT_TIMESTAMP
    );
    RAISE EXCEPTION 'Expected zero Payment.amount to be rejected';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  -- -----------------------------------------------------------------
  -- Payment.idempotencyKey must be unique (no double charge)
  -- -----------------------------------------------------------------
  INSERT INTO "Payment" (
    "id", "orderId", "provider", "amount", "idempotencyKey", "status", "updatedAt"
  ) VALUES (
    'c_pay1', 'commerce_test_order', 'fake', 3000000000, 'c_idem_key', 'PENDING', CURRENT_TIMESTAMP
  );
  BEGIN
    INSERT INTO "Payment" (
      "id", "orderId", "provider", "amount", "idempotencyKey", "status", "updatedAt"
    ) VALUES (
      'c_pay2', 'commerce_test_order', 'fake', 3000000000, 'c_idem_key', 'PENDING', CURRENT_TIMESTAMP
    );
    RAISE EXCEPTION 'Expected duplicate Payment.idempotencyKey to be rejected';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;

  -- -----------------------------------------------------------------
  -- Order.idempotencyKey must be unique (no duplicate checkout)
  -- -----------------------------------------------------------------
  INSERT INTO "Order" (
    "id", "number", "customerId", "subtotal", "grandTotal", "idempotencyKey", "updatedAt"
  ) VALUES (
    'c_order_dedup', 'ORD-DEDUP', 'commerce_test_customer', 0, 0, 'c_order_idem_key', CURRENT_TIMESTAMP
  );
  BEGIN
    INSERT INTO "Order" (
      "id", "number", "customerId", "subtotal", "grandTotal", "idempotencyKey", "updatedAt"
    ) VALUES (
      'c_dup_order', 'ORD-DUP', 'commerce_test_customer', 0, 0, 'c_order_idem_key', CURRENT_TIMESTAMP
    );
    RAISE EXCEPTION 'Expected duplicate Order.idempotencyKey to be rejected';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;

  -- -----------------------------------------------------------------
  -- StockAlertSubscription: duplicate (skuId, userId) rejected
  -- -----------------------------------------------------------------
  INSERT INTO "StockAlertSubscription" ("id", "userId", "skuId", "updatedAt")
  VALUES ('c_alert1', 'commerce_test_user', 'commerce_test_sku', CURRENT_TIMESTAMP);

  BEGIN
    INSERT INTO "StockAlertSubscription" ("id", "userId", "skuId", "updatedAt")
    VALUES ('c_alert2', 'commerce_test_user', 'commerce_test_sku', CURRENT_TIMESTAMP);
    RAISE EXCEPTION 'Expected duplicate active stock alert to be rejected';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;

  -- -----------------------------------------------------------------
  -- StockAlertSubscription: subscriber (user or guest) required
  -- -----------------------------------------------------------------
  BEGIN
    INSERT INTO "StockAlertSubscription" ("id", "userId", "guestToken", "skuId", "updatedAt")
    VALUES ('c_alert3', NULL, NULL, 'commerce_test_sku', CURRENT_TIMESTAMP);
    RAISE EXCEPTION 'Expected stock alert without subscriber to be rejected';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  -- -----------------------------------------------------------------
  -- StockReservation.quantity must be > 0
  -- -----------------------------------------------------------------
  BEGIN
    INSERT INTO "StockReservation" (
      "id", "warehouseId", "locationId", "skuId", "quantity", "expiresAt", "updatedAt"
    ) VALUES (
      'c_res_zero', 'commerce_test_wh', 'commerce_test_loc', 'commerce_test_sku',
      0, CURRENT_TIMESTAMP + INTERVAL '1 hour', CURRENT_TIMESTAMP
    );
    RAISE EXCEPTION 'Expected zero StockReservation.quantity to be rejected';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

END $$;

ROLLBACK;
