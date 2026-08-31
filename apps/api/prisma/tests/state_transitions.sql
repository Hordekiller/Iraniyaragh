\set ON_ERROR_STOP on

BEGIN;

INSERT INTO "User" (
  "id", "mobile", "email", "passwordHash", "status",
  "isMobileVerified", "mobileVerifiedAt", "updatedAt"
) VALUES (
  'st_actor', '+989917112233', 'operator@example.com', repeat('p', 64), 'ACTIVE',
  true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

INSERT INTO "Customer" ("id", "mobile", "firstName", "lastName", "updatedAt")
VALUES ('st_customer', '+989121234567', 'Test', 'Customer', CURRENT_TIMESTAMP);

INSERT INTO "Order" (
  "id", "number", "customerId", "status",
  "subtotal", "discount", "shipping", "grandTotal", "updatedAt"
) VALUES (
  'st_order', 'ST-1001', 'st_customer', 'PENDING_PAYMENT',
  100000, 0, 25000, 125000, CURRENT_TIMESTAMP
);

INSERT INTO "Payment" (
  "id", "orderId", "provider", "amount", "status", "idempotencyKey", "updatedAt"
) VALUES (
  'st_payment', 'st_order', 'test-provider', 125000, 'PENDING', 'st-idem-1', CURRENT_TIMESTAMP
);

INSERT INTO "Fulfillment" ("id", "orderId", "status", "updatedAt")
VALUES ('st_fulfillment', 'st_order', 'PENDING', CURRENT_TIMESTAMP);

DO $$
BEGIN
  -- Valid committed transitions must apply.
  INSERT INTO "OrderTransition" ("id", "orderId", "from", "to", "actorId", "requestId")
  VALUES ('st_ot_01', 'st_order', 'PENDING_PAYMENT', 'PAID', 'st_actor', 'req-1');

  INSERT INTO "PaymentTransition" ("id", "paymentId", "from", "to", "actorId", "requestId")
  VALUES ('st_pt_01', 'st_payment', 'PENDING', 'PAID', 'st_actor', 'req-1');

  INSERT INTO "FulfillmentTransition" ("id", "fulfillmentId", "from", "to", "actorId", "requestId")
  VALUES ('st_ft_01', 'st_fulfillment', 'PENDING', 'PROCESSING', 'st_actor', 'req-1');

  -- DELIVERED -> RETURNED is explicitly allowed for both order and fulfillment.
  INSERT INTO "OrderTransition" ("id", "orderId", "from", "to")
  VALUES ('st_ot_delivered_returned', 'st_order', 'DELIVERED', 'RETURNED');

  INSERT INTO "FulfillmentTransition" ("id", "fulfillmentId", "from", "to")
  VALUES ('st_ft_delivered_returned', 'st_fulfillment', 'DELIVERED', 'RETURNED');

  -- Self-transitions are rejected by the meaningful-state CHECK.
  BEGIN
    INSERT INTO "OrderTransition" ("id", "orderId", "from", "to")
    VALUES ('st_bad_self', 'st_order', 'PAID', 'PAID');
    RAISE EXCEPTION 'Expected OrderTransition meaningful CHECK to reject a self-transition';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  -- Money-path reversal is rejected.
  BEGIN
    INSERT INTO "PaymentTransition" ("id", "paymentId", "from", "to")
    VALUES ('st_bad_reversal', 'st_payment', 'PAID', 'PENDING');
    RAISE EXCEPTION 'Expected PaymentTransition financial-reversal CHECK to reject the row';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  -- Moving out of a terminal CANCELLED state is rejected for orders.
  BEGIN
    INSERT INTO "OrderTransition" ("id", "orderId", "from", "to")
    VALUES ('st_bad_from_cancelled', 'st_order', 'CANCELLED', 'PENDING_PAYMENT');
    RAISE EXCEPTION 'Expected OrderTransition terminal CHECK to reject the row';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  -- Moving out of a terminal CANCELLED state is rejected for fulfillment.
  BEGIN
    INSERT INTO "FulfillmentTransition" ("id", "fulfillmentId", "from", "to")
    VALUES ('st_bad_ft_cancelled', 'st_fulfillment', 'CANCELLED', 'PROCESSING');
    RAISE EXCEPTION 'Expected FulfillmentTransition terminal CHECK to reject the row';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  -- Fulfillment forward progress beyond DELIVERED is rejected without RETURNED.
  BEGIN
    INSERT INTO "FulfillmentTransition" ("id", "fulfillmentId", "from", "to")
    VALUES ('st_bad_ft_redeliver', 'st_fulfillment', 'DELIVERED', 'SHIPPED');
    RAISE EXCEPTION 'Expected FulfillmentTransition delivered-terminal CHECK to reject the row';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  -- REFUNDED -> PENDING (unwinding a settlement without a new attempt) is rejected.
  BEGIN
    INSERT INTO "PaymentTransition" ("id", "paymentId", "from", "to")
    VALUES ('st_bad_refund_unwind', 'st_payment', 'REFUNDED', 'PENDING');
    RAISE EXCEPTION 'Expected PaymentTransition financial-reversal CHECK to reject the row';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
END $$;

ROLLBACK;