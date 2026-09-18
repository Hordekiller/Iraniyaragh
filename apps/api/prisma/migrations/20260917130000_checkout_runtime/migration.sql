-- Checkout runtime persistence: immutable sale-time snapshots, server-owned
-- shipping quotes, scoped idempotency records and a transactional outbox.

ALTER TABLE "Order"
  ADD COLUMN "addressSnapshot" JSONB,
  ADD COLUMN "shippingMethod" VARCHAR(64),
  ADD COLUMN "shippingMethodTitle" VARCHAR(120),
  ADD COLUMN "shippingPolicyRevision" VARCHAR(100),
  ADD COLUMN "pricePolicyRevision" VARCHAR(100),
  ADD COLUMN "reservationExpiresAt" TIMESTAMP(3);

-- The pre-checkout schema could contain scaffold orders. Preserve them explicitly
-- as legacy records instead of dropping data or pretending to know old addresses.
UPDATE "Order"
SET
  "addressSnapshot" = jsonb_build_object('legacy', true),
  "shippingMethod" = 'LEGACY_UNSPECIFIED',
  "shippingMethodTitle" = 'Legacy unspecified',
  "shippingPolicyRevision" = 'legacy',
  "pricePolicyRevision" = 'legacy',
  "reservationExpiresAt" = "createdAt"
WHERE "addressSnapshot" IS NULL;

ALTER TABLE "Order"
  ALTER COLUMN "addressSnapshot" SET NOT NULL,
  ALTER COLUMN "shippingMethod" SET NOT NULL,
  ALTER COLUMN "shippingMethodTitle" SET NOT NULL,
  ALTER COLUMN "shippingPolicyRevision" SET NOT NULL,
  ALTER COLUMN "pricePolicyRevision" SET NOT NULL,
  ALTER COLUMN "reservationExpiresAt" SET NOT NULL,
  ALTER COLUMN "status" SET DEFAULT 'DRAFT'::"OrderStatus";

ALTER TABLE "OrderItem"
  ADD COLUMN "productTitle" TEXT,
  ADD COLUMN "variantTitle" TEXT,
  ADD COLUMN "ordinal" INTEGER;

UPDATE "OrderItem" SET "productTitle" = "title" WHERE "productTitle" IS NULL;
WITH ranked AS (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "orderId" ORDER BY "id") - 1 AS "ordinal"
  FROM "OrderItem"
)
UPDATE "OrderItem" AS item
SET "ordinal" = ranked."ordinal"
FROM ranked
WHERE item."id" = ranked."id";

ALTER TABLE "OrderItem"
  ALTER COLUMN "productTitle" SET NOT NULL,
  ALTER COLUMN "ordinal" SET NOT NULL;

CREATE TABLE "ShippingMethod" (
  "id" TEXT NOT NULL,
  "code" VARCHAR(64) NOT NULL,
  "title" VARCHAR(120) NOT NULL,
  "amount" BIGINT NOT NULL,
  "policyRevision" VARCHAR(100) NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ShippingMethod_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ShippingMethod_amount_nonnegative" CHECK ("amount" >= 0),
  CONSTRAINT "ShippingMethod_code_nonempty" CHECK (btrim("code") <> ''),
  CONSTRAINT "ShippingMethod_title_nonempty" CHECK (btrim("title") <> ''),
  CONSTRAINT "ShippingMethod_policy_nonempty" CHECK (btrim("policyRevision") <> '')
);

CREATE TABLE "ShippingQuote" (
  "id" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "cartId" TEXT NOT NULL,
  "cartVersion" INTEGER NOT NULL,
  "shippingMethodId" TEXT NOT NULL,
  "methodCode" VARCHAR(64) NOT NULL,
  "methodTitle" VARCHAR(120) NOT NULL,
  "addressHash" CHAR(64) NOT NULL,
  "subtotal" BIGINT NOT NULL,
  "amount" BIGINT NOT NULL,
  "pricePolicyRevision" VARCHAR(100) NOT NULL,
  "policyRevision" VARCHAR(100) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "orderId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ShippingQuote_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ShippingQuote_values" CHECK (
    "cartVersion" >= 1 AND "subtotal" >= 0 AND "amount" >= 0 AND "expiresAt" > "createdAt"
    AND btrim("methodCode") <> '' AND btrim("methodTitle") <> ''
    AND btrim("pricePolicyRevision") <> '' AND btrim("policyRevision") <> ''
  ),
  CONSTRAINT "ShippingQuote_consumption" CHECK (("consumedAt" IS NULL) = ("orderId" IS NULL))
);

CREATE TABLE "CheckoutIdempotencyRecord" (
  "id" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "scope" VARCHAR(100) NOT NULL,
  "keyHash" CHAR(64) NOT NULL,
  "fingerprint" CHAR(64) NOT NULL,
  "orderId" TEXT,
  "responseJson" JSONB,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CheckoutIdempotencyRecord_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CheckoutIdempotencyRecord_expiry" CHECK ("expiresAt" > "createdAt"),
  CONSTRAINT "CheckoutIdempotencyRecord_scope_nonempty" CHECK (btrim("scope") <> '')
);

CREATE TABLE "OutboxEvent" (
  "id" TEXT NOT NULL,
  "topic" VARCHAR(100) NOT NULL,
  "aggregateType" VARCHAR(100) NOT NULL,
  "aggregateId" VARCHAR(128) NOT NULL,
  "payload" JSONB NOT NULL,
  "deduplicationKey" VARCHAR(200) NOT NULL,
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "publishedAt" TIMESTAMP(3),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OutboxEvent_values" CHECK (
    btrim("topic") <> '' AND btrim("aggregateType") <> '' AND btrim("aggregateId") <> ''
    AND btrim("deduplicationKey") <> '' AND "attempts" >= 0
  )
);

CREATE UNIQUE INDEX "ShippingMethod_code_key" ON "ShippingMethod"("code");
CREATE INDEX "ShippingMethod_isActive_code_idx" ON "ShippingMethod"("isActive", "code");
CREATE UNIQUE INDEX "OrderItem_orderId_ordinal_key" ON "OrderItem"("orderId", "ordinal");
CREATE UNIQUE INDEX "ShippingQuote_orderId_key" ON "ShippingQuote"("orderId");
CREATE INDEX "ShippingQuote_customerId_expiresAt_idx" ON "ShippingQuote"("customerId", "expiresAt");
CREATE INDEX "ShippingQuote_cartId_cartVersion_idx" ON "ShippingQuote"("cartId", "cartVersion");
CREATE UNIQUE INDEX "CheckoutIdempotencyRecord_customerId_scope_keyHash_key"
  ON "CheckoutIdempotencyRecord"("customerId", "scope", "keyHash");
CREATE INDEX "CheckoutIdempotencyRecord_expiresAt_idx" ON "CheckoutIdempotencyRecord"("expiresAt");
CREATE UNIQUE INDEX "OutboxEvent_deduplicationKey_key" ON "OutboxEvent"("deduplicationKey");
CREATE INDEX "OutboxEvent_publishedAt_availableAt_idx" ON "OutboxEvent"("publishedAt", "availableAt");
CREATE INDEX "OutboxEvent_aggregateType_aggregateId_idx" ON "OutboxEvent"("aggregateType", "aggregateId");

ALTER TABLE "ShippingQuote"
  ADD CONSTRAINT "ShippingQuote_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ShippingQuote_cartId_fkey" FOREIGN KEY ("cartId") REFERENCES "Cart"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ShippingQuote_shippingMethodId_fkey" FOREIGN KEY ("shippingMethodId") REFERENCES "ShippingMethod"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "ShippingQuote_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CheckoutIdempotencyRecord"
  ADD CONSTRAINT "CheckoutIdempotencyRecord_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "CheckoutIdempotencyRecord_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Order"
  ADD CONSTRAINT "Order_checkout_money" CHECK (
    "subtotal" >= 0 AND "discount" >= 0 AND "shipping" >= 0 AND "grandTotal" >= 0
    AND "grandTotal" = "subtotal" - "discount" + "shipping"
  ),
  ADD CONSTRAINT "Order_checkout_snapshot" CHECK (
    jsonb_typeof("addressSnapshot") = 'object'
    AND btrim("shippingMethod") <> '' AND btrim("shippingMethodTitle") <> ''
    AND btrim("shippingPolicyRevision") <> '' AND btrim("pricePolicyRevision") <> ''
  );

ALTER TABLE "OrderItem"
  ADD CONSTRAINT "OrderItem_checkout_values" CHECK (
    "ordinal" >= 0 AND "quantity" > 0 AND "unitPrice" >= 0
    AND "total" = "unitPrice" * "quantity"
  );

ALTER TABLE "StockReservation"
  ADD CONSTRAINT "StockReservation_quantity_positive" CHECK ("quantity" > 0);

ALTER TABLE "InventoryBalance"
  ADD CONSTRAINT "InventoryBalance_consistent" CHECK (
    "onHand" >= 0 AND "reserved" >= 0 AND "available" >= 0
    AND "available" = "onHand" - "reserved"
  );

-- Request middleware accepts correlation ids up to 128 characters. Checkout
-- writes both an Order transition and AuditLog rows, so their persistence must
-- preserve the same public request-id contract instead of failing at 101 bytes.
ALTER TABLE "OrderTransition" ALTER COLUMN "requestId" TYPE VARCHAR(128);
ALTER TABLE "AuditLog" ALTER COLUMN "requestId" TYPE VARCHAR(128);
