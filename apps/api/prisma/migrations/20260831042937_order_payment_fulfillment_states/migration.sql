-- CreateEnum
CREATE TYPE "FulfillmentStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY_TO_SHIP', 'SHIPPED', 'DELIVERED', 'RETURNED', 'CANCELLED');

-- CreateTable
CREATE TABLE "OrderTransition" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "from" "OrderStatus" NOT NULL,
    "to" "OrderStatus" NOT NULL,
    "reason" VARCHAR(255),
    "actorId" TEXT,
    "requestId" VARCHAR(100),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderTransition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentTransition" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "from" "PaymentStatus" NOT NULL,
    "to" "PaymentStatus" NOT NULL,
    "reason" VARCHAR(255),
    "actorId" TEXT,
    "requestId" VARCHAR(100),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentTransition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fulfillment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "status" "FulfillmentStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Fulfillment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FulfillmentTransition" (
    "id" TEXT NOT NULL,
    "fulfillmentId" TEXT NOT NULL,
    "from" "FulfillmentStatus" NOT NULL,
    "to" "FulfillmentStatus" NOT NULL,
    "reason" VARCHAR(255),
    "actorId" TEXT,
    "requestId" VARCHAR(100),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FulfillmentTransition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrderTransition_orderId_createdAt_idx" ON "OrderTransition"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "OrderTransition_actorId_createdAt_idx" ON "OrderTransition"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "OrderTransition_to_createdAt_idx" ON "OrderTransition"("to", "createdAt");

-- CreateIndex
CREATE INDEX "PaymentTransition_paymentId_createdAt_idx" ON "PaymentTransition"("paymentId", "createdAt");

-- CreateIndex
CREATE INDEX "PaymentTransition_actorId_createdAt_idx" ON "PaymentTransition"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "PaymentTransition_to_createdAt_idx" ON "PaymentTransition"("to", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Fulfillment_orderId_key" ON "Fulfillment"("orderId");

-- CreateIndex
CREATE INDEX "Fulfillment_status_updatedAt_idx" ON "Fulfillment"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "FulfillmentTransition_fulfillmentId_createdAt_idx" ON "FulfillmentTransition"("fulfillmentId", "createdAt");

-- CreateIndex
CREATE INDEX "FulfillmentTransition_actorId_createdAt_idx" ON "FulfillmentTransition"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "FulfillmentTransition_to_createdAt_idx" ON "FulfillmentTransition"("to", "createdAt");

-- AddForeignKey
ALTER TABLE "OrderTransition" ADD CONSTRAINT "OrderTransition_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderTransition" ADD CONSTRAINT "OrderTransition_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentTransition" ADD CONSTRAINT "PaymentTransition_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentTransition" ADD CONSTRAINT "PaymentTransition_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fulfillment" ADD CONSTRAINT "Fulfillment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FulfillmentTransition" ADD CONSTRAINT "FulfillmentTransition_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FulfillmentTransition" ADD CONSTRAINT "FulfillmentTransition_fulfillmentId_fkey" FOREIGN KEY ("fulfillmentId") REFERENCES "Fulfillment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- State-machine invariants (conservative subset enforced in the database).
-- Prisma does not reproduce these CHECK constraints, so they must be preserved
-- verbatim in future migrations and covered by tests (see ADR-0005 note).

-- A transition must always move between two different states.
ALTER TABLE "OrderTransition"
  ADD CONSTRAINT "OrderTransition_meaningful" CHECK ("from" <> "to"),
  ADD CONSTRAINT "OrderTransition_no_backwards_to_pending" CHECK (NOT ("from" = 'PAID'::"OrderStatus" AND "to" = 'PENDING_PAYMENT'::"OrderStatus")),
  ADD CONSTRAINT "OrderTransition_delivered_terminal" CHECK (NOT ("from" = 'DELIVERED'::"OrderStatus" AND "to" <> 'RETURNED'::"OrderStatus")),
  ADD CONSTRAINT "OrderTransition_terminal" CHECK ("from" NOT IN ('CANCELLED'::"OrderStatus", 'RETURNED'::"OrderStatus"));

ALTER TABLE "PaymentTransition"
  ADD CONSTRAINT "PaymentTransition_meaningful" CHECK ("from" <> "to"),
  ADD CONSTRAINT "PaymentTransition_no_financial_reversal" CHECK (NOT ("from" IN ('PAID'::"PaymentStatus", 'REFUNDED'::"PaymentStatus", 'PARTIALLY_REFUNDED'::"PaymentStatus") AND "to" IN ('PENDING'::"PaymentStatus", 'FAILED'::"PaymentStatus", 'CANCELLED'::"PaymentStatus")));

ALTER TABLE "FulfillmentTransition"
  ADD CONSTRAINT "FulfillmentTransition_meaningful" CHECK ("from" <> "to"),
  ADD CONSTRAINT "FulfillmentTransition_delivered_terminal" CHECK (NOT ("from" = 'DELIVERED'::"FulfillmentStatus" AND "to" <> 'RETURNED'::"FulfillmentStatus")),
  ADD CONSTRAINT "FulfillmentTransition_terminal" CHECK ("from" NOT IN ('CANCELLED'::"FulfillmentStatus", 'RETURNED'::"FulfillmentStatus"));
