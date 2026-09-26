-- ADR-0006 records aggregate creation as NULL -> PENDING. Preserve existing
-- history and reconstruct the missing initial event for older fulfillments.
ALTER TABLE "FulfillmentTransition" ALTER COLUMN "from" DROP NOT NULL;

ALTER TABLE "FulfillmentTransition"
  ADD CONSTRAINT "FulfillmentTransition_initial_pending"
  CHECK ("from" IS NOT NULL OR "to" = 'PENDING'::"FulfillmentStatus");

-- At most one creation event can exist for an aggregate, including on retries.
CREATE UNIQUE INDEX "FulfillmentTransition_one_initial_per_fulfillment"
  ON "FulfillmentTransition" ("fulfillmentId") WHERE "from" IS NULL;

INSERT INTO "FulfillmentTransition" ("id", "fulfillmentId", "from", "to", "reason", "createdAt")
SELECT md5('fulfillment-initial:' || fulfillment."id"), fulfillment."id", NULL,
       'PENDING'::"FulfillmentStatus", 'LEGACY_INITIAL_BACKFILL', fulfillment."createdAt"
FROM "Fulfillment" AS fulfillment
WHERE NOT EXISTS (
  SELECT 1 FROM "FulfillmentTransition" AS transition
  WHERE transition."fulfillmentId" = fulfillment."id" AND transition."from" IS NULL
);
