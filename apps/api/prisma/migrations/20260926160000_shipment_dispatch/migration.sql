CREATE TABLE "Shipment" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "fulfillmentId" TEXT NOT NULL,
  "carrier" VARCHAR(80) NOT NULL,
  "trackingCode" VARCHAR(120) NOT NULL,
  "addressSnapshot" JSONB NOT NULL,
  "actorId" TEXT,
  "requestId" VARCHAR(100) NOT NULL,
  "dispatchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Shipment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ShipmentLine" (
  "id" TEXT NOT NULL,
  "shipmentId" TEXT NOT NULL,
  "orderItemId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  CONSTRAINT "ShipmentLine_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ShipmentLine_positive_quantity" CHECK ("quantity" > 0)
);

CREATE UNIQUE INDEX "Shipment_orderId_key" ON "Shipment"("orderId");
CREATE UNIQUE INDEX "Shipment_fulfillmentId_key" ON "Shipment"("fulfillmentId");
CREATE UNIQUE INDEX "Shipment_carrier_trackingCode_key" ON "Shipment"("carrier", "trackingCode");
CREATE UNIQUE INDEX "Shipment_orderId_requestId_key" ON "Shipment"("orderId", "requestId");
CREATE INDEX "Shipment_actorId_dispatchedAt_idx" ON "Shipment"("actorId", "dispatchedAt");
CREATE UNIQUE INDEX "ShipmentLine_orderItemId_key" ON "ShipmentLine"("orderItemId");
CREATE INDEX "ShipmentLine_shipmentId_idx" ON "ShipmentLine"("shipmentId");

ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_fulfillmentId_fkey" FOREIGN KEY ("fulfillmentId") REFERENCES "Fulfillment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ShipmentLine" ADD CONSTRAINT "ShipmentLine_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ShipmentLine" ADD CONSTRAINT "ShipmentLine_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION "validate_shipment_order"() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "Fulfillment" WHERE "id" = NEW."fulfillmentId" AND "orderId" = NEW."orderId") THEN
    RAISE EXCEPTION 'Shipment fulfillment must belong to the order' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "Shipment_validate" BEFORE INSERT OR UPDATE ON "Shipment"
  FOR EACH ROW EXECUTE FUNCTION "validate_shipment_order"();

CREATE FUNCTION "validate_shipment_line"() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "Shipment" AS shipment
    JOIN "OrderItem" AS item ON item."orderId" = shipment."orderId"
    WHERE shipment."id" = NEW."shipmentId" AND item."id" = NEW."orderItemId" AND item."quantity" = NEW."quantity"
  ) THEN
    RAISE EXCEPTION 'Shipment line must match the order and exact quantity' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "ShipmentLine_validate" BEFORE INSERT OR UPDATE ON "ShipmentLine"
  FOR EACH ROW EXECUTE FUNCTION "validate_shipment_line"();
