CREATE TABLE "FulfillmentPick" (
  "id" TEXT NOT NULL,
  "fulfillmentId" TEXT NOT NULL,
  "orderItemId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "actorId" TEXT,
  "requestId" VARCHAR(100) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FulfillmentPick_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FulfillmentPick_positive_quantity" CHECK ("quantity" > 0)
);

CREATE UNIQUE INDEX "FulfillmentPick_orderItemId_key" ON "FulfillmentPick"("orderItemId");
CREATE UNIQUE INDEX "FulfillmentPick_fulfillmentId_requestId_key" ON "FulfillmentPick"("fulfillmentId", "requestId");
CREATE INDEX "FulfillmentPick_fulfillmentId_createdAt_idx" ON "FulfillmentPick"("fulfillmentId", "createdAt");
CREATE INDEX "FulfillmentPick_actorId_createdAt_idx" ON "FulfillmentPick"("actorId", "createdAt");

ALTER TABLE "FulfillmentPick" ADD CONSTRAINT "FulfillmentPick_fulfillmentId_fkey"
  FOREIGN KEY ("fulfillmentId") REFERENCES "Fulfillment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FulfillmentPick" ADD CONSTRAINT "FulfillmentPick_orderItemId_fkey"
  FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FulfillmentPick" ADD CONSTRAINT "FulfillmentPick_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The pick must reference a line in the same order and prove its exact
-- immutable ordered quantity, even if a writer bypasses the API service.
CREATE FUNCTION "validate_fulfillment_pick"() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "Fulfillment" AS fulfillment
    JOIN "OrderItem" AS item ON item."orderId" = fulfillment."orderId"
    WHERE fulfillment."id" = NEW."fulfillmentId"
      AND item."id" = NEW."orderItemId"
      AND item."quantity" = NEW."quantity"
  ) THEN
    RAISE EXCEPTION 'Fulfillment pick must match an order item and its exact quantity'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "FulfillmentPick_validate"
  BEFORE INSERT OR UPDATE ON "FulfillmentPick"
  FOR EACH ROW EXECUTE FUNCTION "validate_fulfillment_pick"();
