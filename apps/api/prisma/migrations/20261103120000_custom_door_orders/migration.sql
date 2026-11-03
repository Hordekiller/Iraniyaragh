-- CreateEnum
CREATE TYPE "DoorProductionStatus" AS ENUM ('DRAFT', 'PENDING_QUOTE_APPROVAL', 'AWAITING_DEPOSIT', 'DEPOSIT_PAID', 'AWAITING_TECHNICAL_APPROVAL', 'APPROVED_FOR_PRODUCTION', 'IN_PRODUCTION', 'QUALITY_CONTROL', 'READY_FOR_DELIVERY', 'AWAITING_SETTLEMENT', 'COMPLETED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "OutboxEffectKind" ADD VALUE 'CUSTOMER_DOOR_QUOTE_APPROVED';

-- AlterTable
ALTER TABLE "ProductVariant" ADD COLUMN     "inventoryUnit" VARCHAR(8) NOT NULL DEFAULT 'PIECE';

-- AlterTable
ALTER TABLE "InvoiceDraft" ADD COLUMN     "doorQuoteId" TEXT;

-- AlterTable
ALTER TABLE "InvoiceDraftLine" ALTER COLUMN "variantId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "InvoiceDocumentLine" ALTER COLUMN "orderItemId" DROP NOT NULL,
ALTER COLUMN "variantId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "DoorModel" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "title" VARCHAR(150) NOT NULL,
    "type" VARCHAR(16) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "configuration" JSONB NOT NULL,
    "imageMediaId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DoorModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DoorMaterial" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "title" VARCHAR(150) NOT NULL,
    "category" VARCHAR(24) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "configuration" JSONB NOT NULL,
    "variantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DoorMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DoorCatalogRevision" (
    "id" TEXT NOT NULL,
    "entityType" VARCHAR(24) NOT NULL,
    "entityId" VARCHAR(128) NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DoorCatalogRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DoorOrder" (
    "id" TEXT NOT NULL,
    "status" "DoorProductionStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "currentQuoteVersion" INTEGER NOT NULL DEFAULT 1,
    "technicalApproved" BOOLEAN NOT NULL DEFAULT false,
    "customerAcceptedQuoteVersion" INTEGER,
    "delivery" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DoorOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DoorOrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "widthMm" INTEGER NOT NULL,
    "heightMm" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "configuration" JSONB NOT NULL,
    "notes" VARCHAR(1000) NOT NULL DEFAULT '',

    CONSTRAINT "DoorOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DoorQuotation" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "total" BIGINT,
    "deposit" BIGINT,
    "snapshot" JSONB NOT NULL,
    "approvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DoorQuotation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DoorPaymentAllocation" (
    "paymentId" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "purpose" VARCHAR(16) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DoorPaymentAllocation_pkey" PRIMARY KEY ("paymentId")
);

-- CreateTable
CREATE TABLE "DoorProductionRecord" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "action" VARCHAR(64) NOT NULL,
    "message" VARCHAR(1000) NOT NULL,
    "payload" JSONB NOT NULL,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DoorProductionRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DoorMaterialRequirement" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "materialId" TEXT NOT NULL,
    "variantId" TEXT,
    "snapshot" JSONB NOT NULL,
    "actualStockQuantity" INTEGER,
    "reservationId" TEXT,
    "consumedAt" TIMESTAMP(3),

    CONSTRAINT "DoorMaterialRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DoorAttachment" (
    "checksumSha256" CHAR(64) NOT NULL,
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "filename" VARCHAR(150) NOT NULL,
    "mime" VARCHAR(64) NOT NULL,
    "bytes" INTEGER NOT NULL,
    "objectKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DoorAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DoorCommand" (
    "key" CHAR(64) NOT NULL,
    "fingerprint" CHAR(64) NOT NULL,
    "resultId" VARCHAR(128) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DoorCommand_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "DoorModel_code_key" ON "DoorModel"("code");

-- CreateIndex
CREATE INDEX "DoorModel_active_type_idx" ON "DoorModel"("active", "type");

-- CreateIndex
CREATE UNIQUE INDEX "DoorMaterial_code_key" ON "DoorMaterial"("code");

-- CreateIndex
CREATE INDEX "DoorMaterial_active_category_idx" ON "DoorMaterial"("active", "category");

-- CreateIndex
CREATE UNIQUE INDEX "DoorCatalogRevision_entityType_entityId_version_key" ON "DoorCatalogRevision"("entityType", "entityId", "version");

-- CreateIndex
CREATE INDEX "DoorOrder_status_createdAt_idx" ON "DoorOrder"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DoorOrderItem_orderId_ordinal_key" ON "DoorOrderItem"("orderId", "ordinal");

-- CreateIndex
CREATE UNIQUE INDEX "DoorQuotation_orderId_version_key" ON "DoorQuotation"("orderId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "DoorQuotation_id_orderId_key" ON "DoorQuotation"("id", "orderId");

-- CreateIndex
CREATE INDEX "DoorPaymentAllocation_quoteId_idx" ON "DoorPaymentAllocation"("quoteId");

-- CreateIndex
CREATE INDEX "DoorProductionRecord_orderId_createdAt_idx" ON "DoorProductionRecord"("orderId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DoorMaterialRequirement_reservationId_key" ON "DoorMaterialRequirement"("reservationId");

-- CreateIndex
CREATE INDEX "DoorMaterialRequirement_orderId_idx" ON "DoorMaterialRequirement"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "DoorMaterialRequirement_quoteId_ordinal_key" ON "DoorMaterialRequirement"("quoteId", "ordinal");

-- CreateIndex
CREATE UNIQUE INDEX "DoorAttachment_objectKey_key" ON "DoorAttachment"("objectKey");

-- CreateIndex
CREATE INDEX "DoorAttachment_orderId_idx" ON "DoorAttachment"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "DoorAttachment_orderId_checksumSha256_key" ON "DoorAttachment"("orderId", "checksumSha256");

-- AddForeignKey
ALTER TABLE "InvoiceDraft" ADD CONSTRAINT "InvoiceDraft_doorQuoteId_fkey" FOREIGN KEY ("doorQuoteId") REFERENCES "DoorQuotation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoorModel" ADD CONSTRAINT "DoorModel_imageMediaId_fkey" FOREIGN KEY ("imageMediaId") REFERENCES "ProductMedia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoorMaterial" ADD CONSTRAINT "DoorMaterial_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoorCatalogRevision" ADD CONSTRAINT "DoorCatalogRevision_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoorOrder" ADD CONSTRAINT "DoorOrder_id_fkey" FOREIGN KEY ("id") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoorOrderItem" ADD CONSTRAINT "DoorOrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "DoorOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoorOrderItem" ADD CONSTRAINT "DoorOrderItem_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "DoorModel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoorQuotation" ADD CONSTRAINT "DoorQuotation_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "DoorOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoorQuotation" ADD CONSTRAINT "DoorQuotation_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoorPaymentAllocation" ADD CONSTRAINT "DoorPaymentAllocation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoorPaymentAllocation" ADD CONSTRAINT "DoorPaymentAllocation_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "DoorQuotation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoorProductionRecord" ADD CONSTRAINT "DoorProductionRecord_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "DoorOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoorProductionRecord" ADD CONSTRAINT "DoorProductionRecord_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoorMaterialRequirement" ADD CONSTRAINT "DoorMaterialRequirement_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "DoorOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoorMaterialRequirement" ADD CONSTRAINT "DoorMaterialRequirement_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "DoorQuotation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoorMaterialRequirement" ADD CONSTRAINT "DoorMaterialRequirement_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "DoorMaterial"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoorMaterialRequirement" ADD CONSTRAINT "DoorMaterialRequirement_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoorMaterialRequirement" ADD CONSTRAINT "DoorMaterialRequirement_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "StockReservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoorAttachment" ADD CONSTRAINT "DoorAttachment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "DoorOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Domain and money bounds supplement Prisma's structural foreign keys.
ALTER TABLE "ProductVariant" ADD CONSTRAINT door_inventory_unit CHECK ("inventoryUnit" IN ('PIECE','MM','MM2'));
ALTER TABLE "DoorModel" ADD CONSTRAINT door_model_bounds CHECK ("type" IN ('FORMLEX','DECOFIX') AND "version">0 AND "code" ~ '^[a-z][a-z0-9-]{0,63}$' AND length(btrim("title"))>0 AND jsonb_typeof("configuration")='object');
ALTER TABLE "DoorMaterial" ADD CONSTRAINT door_material_bounds CHECK ("category" IN ('GLASS','PROFILE','HARDWARE','SERVICE') AND "version">0 AND "code" ~ '^[a-z][a-z0-9-]{0,63}$' AND length(btrim("title"))>0 AND jsonb_typeof("configuration")='object' AND ("variantId" IS NULL OR "category"<>'SERVICE'));
ALTER TABLE "DoorOrder" ADD CONSTRAINT door_order_versions CHECK ("version">0 AND "currentQuoteVersion">0 AND ("customerAcceptedQuoteVersion" IS NULL OR "customerAcceptedQuoteVersion"="currentQuoteVersion"));
ALTER TABLE "DoorOrderItem" ADD CONSTRAINT door_item_bounds CHECK ("widthMm">0 AND "heightMm">0 AND "quantity" BETWEEN 1 AND 1000 AND "ordinal" BETWEEN 0 AND 49 AND jsonb_typeof("configuration")='array');
ALTER TABLE "DoorQuotation" ADD CONSTRAINT door_quote_money CHECK ("version">0 AND ((NOT approved AND total IS NULL AND deposit IS NULL) OR (approved AND total IS NOT NULL AND deposit IS NOT NULL AND total>=0 AND deposit>=0 AND deposit<=total)) AND jsonb_typeof(snapshot)='object' AND (NOT approved OR (snapshot->>'total' IS NOT DISTINCT FROM total::text AND snapshot->>'deposit' IS NOT DISTINCT FROM deposit::text)));
ALTER TABLE "DoorPaymentAllocation" ADD CONSTRAINT door_allocation_purpose CHECK (purpose IN ('DEPOSIT','SETTLEMENT'));
ALTER TABLE "DoorMaterialRequirement" ADD CONSTRAINT door_requirement_bounds CHECK (ordinal>=0 AND ("actualStockQuantity" IS NULL OR "actualStockQuantity">0) AND ("reservationId" IS NULL OR ("variantId" IS NOT NULL AND "actualStockQuantity" IS NOT NULL)) AND ("consumedAt" IS NULL OR "reservationId" IS NOT NULL));
ALTER TABLE "DoorAttachment" ADD CONSTRAINT door_attachment_bounds CHECK (bytes BETWEEN 1 AND 8388608 AND mime IN ('image/jpeg','image/png','image/webp','application/pdf') AND "checksumSha256" ~ '^[a-f0-9]{64}$' AND "objectKey" LIKE 'quarantine/custom-doors/%');
ALTER TABLE "DoorCatalogRevision" ADD CONSTRAINT door_revision_bounds CHECK (version>0 AND "entityType" IN ('MODEL','MATERIAL','VISIBILITY','NOTIFICATION') AND jsonb_typeof(snapshot)='object');

CREATE FUNCTION door_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  RAISE EXCEPTION 'Custom production evidence is append-only' USING ERRCODE='23514';
END $$;
CREATE TRIGGER door_quote_immutable BEFORE UPDATE OR DELETE ON "DoorQuotation" FOR EACH ROW EXECUTE FUNCTION door_immutable();
CREATE TRIGGER door_revision_immutable BEFORE UPDATE OR DELETE ON "DoorCatalogRevision" FOR EACH ROW EXECUTE FUNCTION door_immutable();
CREATE TRIGGER door_production_record_immutable BEFORE UPDATE OR DELETE ON "DoorProductionRecord" FOR EACH ROW EXECUTE FUNCTION door_immutable();
CREATE TRIGGER door_allocation_immutable BEFORE UPDATE OR DELETE ON "DoorPaymentAllocation" FOR EACH ROW EXECUTE FUNCTION door_immutable();
CREATE TRIGGER door_attachment_immutable BEFORE UPDATE OR DELETE ON "DoorAttachment" FOR EACH ROW EXECUTE FUNCTION door_immutable();
CREATE TRIGGER door_command_immutable BEFORE UPDATE OR DELETE ON "DoorCommand" FOR EACH ROW EXECUTE FUNCTION door_immutable();

CREATE FUNCTION door_order_evidence_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE d "DoorOrder"%ROWTYPE; q "DoorQuotation"%ROWTYPE; o "Order"%ROWTYPE; target text;
BEGIN
  IF TG_TABLE_NAME='DoorOrder' THEN target:=NEW.id;
  ELSIF TG_TABLE_NAME='Order' THEN target:=NEW.id;
  ELSE target:=NEW."orderId"; END IF;
  SELECT * INTO d FROM "DoorOrder" WHERE id=target;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO q FROM "DoorQuotation" WHERE "orderId"=d.id AND version=d."currentQuoteVersion";
  SELECT * INTO o FROM "Order" WHERE id=d.id;
  IF q.id IS NULL OR d."currentQuoteVersion"<>(SELECT max(version) FROM "DoorQuotation" WHERE "orderId"=d.id) OR
     (SELECT count(*) FROM "DoorOrderItem" WHERE "orderId"=d.id) NOT BETWEEN 1 AND 50 OR
     (q.approved AND o."grandTotal"<>q.total) OR (NOT q.approved AND d.status NOT IN ('DRAFT','PENDING_QUOTE_APPROVAL','CANCELLED')) OR
     (d.status IN ('APPROVED_FOR_PRODUCTION','IN_PRODUCTION','QUALITY_CONTROL','READY_FOR_DELIVERY','AWAITING_SETTLEMENT','COMPLETED') AND (NOT d."technicalApproved" OR d."customerAcceptedQuoteVersion" IS DISTINCT FROM q.version)) THEN
    RAISE EXCEPTION 'Custom production order and quotation evidence do not reconcile' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER door_order_evidence AFTER INSERT OR UPDATE ON "DoorOrder" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION door_order_evidence_guard();
CREATE CONSTRAINT TRIGGER door_commercial_evidence AFTER INSERT OR UPDATE ON "Order" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION door_order_evidence_guard();
CREATE CONSTRAINT TRIGGER door_quote_evidence AFTER INSERT ON "DoorQuotation" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION door_order_evidence_guard();

CREATE FUNCTION door_allocation_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p "Payment"%ROWTYPE; q "DoorQuotation"%ROWTYPE;
BEGIN
  SELECT * INTO p FROM "Payment" WHERE id=NEW."paymentId";
  SELECT * INTO q FROM "DoorQuotation" WHERE id=NEW."quoteId";
  IF p.id IS NULL OR q.id IS NULL OR p."orderId"<>q."orderId" OR NOT q.approved OR p.amount<=0 OR p.amount>q.total THEN
    RAISE EXCEPTION 'Payment must allocate to its own approved production quotation' USING ERRCODE='23514';
  END IF; RETURN NEW;
END $$;
CREATE TRIGGER door_allocation_guard BEFORE INSERT ON "DoorPaymentAllocation" FOR EACH ROW EXECUTE FUNCTION door_allocation_guard();

CREATE FUNCTION door_requirement_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE q "DoorQuotation"%ROWTYPE; r "StockReservation"%ROWTYPE;
BEGIN
 SELECT * INTO q FROM "DoorQuotation" WHERE id=NEW."quoteId";
 IF q."orderId" IS DISTINCT FROM NEW."orderId" OR NOT q.approved THEN RAISE EXCEPTION 'BOM must belong to an approved quote on the same order' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND (ROW(NEW."orderId",NEW."quoteId",NEW.ordinal,NEW."materialId",NEW."variantId",NEW.snapshot) IS DISTINCT FROM ROW(OLD."orderId",OLD."quoteId",OLD.ordinal,OLD."materialId",OLD."variantId",OLD.snapshot) OR OLD."consumedAt" IS NOT NULL) THEN RAISE EXCEPTION 'BOM snapshot and consumed evidence are immutable' USING ERRCODE='23514'; END IF;
 IF NEW."reservationId" IS NOT NULL THEN
  SELECT * INTO r FROM "StockReservation" WHERE id=NEW."reservationId";
  IF r."variantId" IS DISTINCT FROM NEW."variantId" OR r.quantity IS DISTINCT FROM NEW."actualStockQuantity" OR r."orderId" IS NOT NULL OR (NEW."consumedAt" IS NOT NULL AND r.status<>'CONSUMED') THEN RAISE EXCEPTION 'BOM reservation quantity and stock identity must match' USING ERRCODE='23514'; END IF;
 END IF; RETURN NEW;
END $$;
CREATE TRIGGER door_requirement_guard BEFORE INSERT OR UPDATE ON "DoorMaterialRequirement" FOR EACH ROW EXECUTE FUNCTION door_requirement_guard();

CREATE FUNCTION door_stock_unit_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW."inventoryUnit"<>OLD."inventoryUnit" AND (
 EXISTS(SELECT 1 FROM "InventoryBalance" WHERE "variantId"=OLD.id) OR EXISTS(SELECT 1 FROM "InventoryMovement" WHERE "variantId"=OLD.id) OR
 EXISTS(SELECT 1 FROM "StockReservation" WHERE "variantId"=OLD.id) OR EXISTS(SELECT 1 FROM "DoorMaterial" WHERE "variantId"=OLD.id)) THEN
 RAISE EXCEPTION 'Stock unit cannot reinterpret existing inventory history' USING ERRCODE='23514'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER door_stock_unit_guard BEFORE UPDATE ON "ProductVariant" FOR EACH ROW EXECUTE FUNCTION door_stock_unit_guard();
CREATE FUNCTION door_material_unit_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW."variantId" IS NOT NULL AND (NEW.configuration->>'stockUnit') IS DISTINCT FROM (SELECT "inventoryUnit" FROM "ProductVariant" WHERE id=NEW."variantId") THEN RAISE EXCEPTION 'Material unit must match the authoritative SKU base unit' USING ERRCODE='23514'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER door_material_unit_guard BEFORE INSERT OR UPDATE ON "DoorMaterial" FOR EACH ROW EXECUTE FUNCTION door_material_unit_guard();

-- Nullable invoice SKU references are reserved for a real approved production
-- service. Retail/catalog drafts retain their existing non-null SKU contract.
CREATE FUNCTION door_invoice_line_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE d "InvoiceDraft"%ROWTYPE;
BEGIN
 SELECT * INTO d FROM "InvoiceDraft" WHERE id=NEW."draftId";
 IF (NEW."variantId" IS NULL) <> (d."doorQuoteId" IS NOT NULL) THEN RAISE EXCEPTION 'Only production service invoice lines may omit a physical SKU' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER door_invoice_line_guard BEFORE INSERT OR UPDATE ON "InvoiceDraftLine" FOR EACH ROW EXECUTE FUNCTION door_invoice_line_guard();
CREATE FUNCTION door_invoice_source_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE q "DoorQuotation"%ROWTYPE;
BEGIN
 IF TG_OP='UPDATE' AND NEW."doorQuoteId" IS DISTINCT FROM OLD."doorQuoteId" THEN RAISE EXCEPTION 'Invoice source quotation is immutable' USING ERRCODE='23514'; END IF;
 IF NEW."doorQuoteId" IS NOT NULL THEN
  SELECT * INTO q FROM "DoorQuotation" WHERE id=NEW."doorQuoteId";
  IF NOT q.approved OR q."orderId" IS DISTINCT FROM NEW."sourceOrderId" OR NEW.source<>'ORDER' THEN RAISE EXCEPTION 'Invoice source must be the approved quote of its sale' USING ERRCODE='23514'; END IF;
 END IF; RETURN NEW;
END $$;
CREATE TRIGGER door_invoice_source_guard BEFORE INSERT OR UPDATE ON "InvoiceDraft" FOR EACH ROW EXECUTE FUNCTION door_invoice_source_guard();

CREATE OR REPLACE FUNCTION invoice_document_reconcile() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target text; doc "InvoiceDocument"%ROWTYPE; d "InvoiceDraft"%ROWTYPE; o "Order"%ROWTYPE; p "InvoicePolicyRevision"%ROWTYPE;
 line_count integer; line_gross numeric; line_discount numeric; line_net numeric; line_tax numeric; line_total numeric;
 shipping_net numeric; shipping_tax numeric;
BEGIN
 IF TG_TABLE_NAME = 'InvoiceDraft' THEN
  IF NEW."state" <> 'ISSUED' THEN RETURN NULL; END IF;
  SELECT "id" INTO target FROM "InvoiceDocument" WHERE "draftId" = NEW."id";
  IF target IS NULL THEN RAISE EXCEPTION 'Issued draft requires its final document' USING ERRCODE = '23514'; END IF;
 ELSIF TG_TABLE_NAME = 'InvoiceDocument' THEN target := NEW."id";
 ELSE target := NEW."documentId"; END IF;
 SELECT * INTO doc FROM "InvoiceDocument" WHERE "id" = target;
 SELECT * INTO d FROM "InvoiceDraft" WHERE "id" = doc."draftId";
 SELECT * INTO o FROM "Order" WHERE "id" = doc."orderId";
 SELECT * INTO p FROM "InvoicePolicyRevision" WHERE "id" = doc."policyRevisionId";
 SELECT count(*),sum("unitPrice"::numeric * "quantity"),sum("discount"),sum("netAmount"),sum("tax"),sum("total")
 INTO line_count,line_gross,line_discount,line_net,line_tax,line_total FROM "InvoiceDocumentLine" WHERE "documentId" = target;
 shipping_net := doc."shipping"; shipping_tax := 0;
 IF p."shippingTaxable" AND p."taxTreatment" <> 'EXEMPT' THEN
  IF p."taxTreatment" = 'INCLUSIVE' THEN shipping_net := round(doc."shipping"::numeric * 10000 / (10000 + p."taxRateBps")); shipping_tax := doc."shipping" - shipping_net;
  ELSE shipping_tax := round(doc."shipping"::numeric * p."taxRateBps" / 10000); END IF;
 END IF;
 IF d."state" <> 'ISSUED' OR d."source" <> 'ORDER' OR d."sourceOrderId" <> o."id" OR d."version" <> doc."draftVersion" OR
 d."sourceOrderVersion" <> doc."orderVersion" OR o."version" <> doc."orderVersion" OR o."status" NOT IN ('PENDING_PAYMENT','PAID','CREDIT_APPROVED') OR
 d."customerId" <> doc."customerId" OR o."customerId" <> doc."customerId" OR d."policyRevisionId" <> p."id" OR NOT p."isActive" OR
 p."version" <> (SELECT max("version") FROM "InvoicePolicyRevision") OR
 doc."subtotal" <> o."subtotal" OR doc."discount" <> o."discount" OR doc."shipping" <> o."shipping" OR doc."grandTotal" <> o."grandTotal" OR
 line_count NOT BETWEEN 1 AND 50 OR (d."doorQuoteId" IS NULL AND line_count <> (SELECT count(*) FROM "OrderItem" WHERE "orderId" = o."id")) OR (d."doorQuoteId" IS NOT NULL AND line_count <> 1) OR
 line_count <> (SELECT count(*) FROM "InvoiceDraftLine" WHERE "draftId" = d."id") OR
 line_gross <> doc."subtotal" OR line_discount <> doc."discount" OR line_net + shipping_net <> doc."netAmount" OR line_tax + shipping_tax <> doc."tax" OR line_total + shipping_net + shipping_tax <> doc."grandTotal" OR
 doc."period" <> extract(year from (doc."issuedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Tehran')::integer OR
 doc."number" <> 'IRY-' || doc."period"::text || '-' || lpad(doc."sequence"::text, greatest(6,length(doc."sequence"::text)), '0') OR
 NOT EXISTS (SELECT 1 FROM "InvoiceDocumentEvent" WHERE "documentId" = target AND "action" = 'ISSUED' AND "actorId" = doc."issuedById") OR
 NOT EXISTS (SELECT 1 FROM "InvoiceIssueCommand" WHERE "documentId" = target AND "draftId" = d."id" AND "committedVersion" = d."version" AND "actorId" = doc."issuedById") OR
 EXISTS (SELECT 1 FROM "InvoiceDocumentLine" l JOIN "OrderItem" i ON i."id" = l."orderItemId"
 LEFT JOIN "InvoiceDraftLine" dl ON dl."draftId" = d."id" AND dl."ordinal" = l."ordinal"
 WHERE l."documentId" = target AND (i."orderId" <> o."id" OR l."variantId" <> i."variantId" OR l."quantity" <> i."quantity" OR l."unitPrice" <> i."unitPrice" OR l."sku" <> i."sku" OR l."title" <> i."title" OR
 dl."id" IS NULL OR dl."variantId" <> l."variantId" OR dl."quantity" <> l."quantity" OR dl."unitPrice" <> l."unitPrice" OR dl."discount" <> 0 OR
 l."netAmount"::numeric <> CASE WHEN p."taxTreatment" = 'INCLUSIVE' THEN round((l."unitPrice"::numeric * l."quantity" - l."discount") * 10000 / (10000 + p."taxRateBps")) ELSE l."unitPrice"::numeric * l."quantity" - l."discount" END OR
 l."tax"::numeric <> CASE WHEN p."taxTreatment" = 'EXEMPT' THEN 0 WHEN p."taxTreatment" = 'INCLUSIVE' THEN l."unitPrice"::numeric * l."quantity" - l."discount" - l."netAmount" ELSE round(l."netAmount"::numeric * p."taxRateBps" / 10000) END)) OR
 (d."doorQuoteId" IS NOT NULL AND (
 NOT EXISTS (SELECT 1 FROM "DoorQuotation" q JOIN "DoorOrder" dd ON dd.id=q."orderId" WHERE q.id=d."doorQuoteId" AND q.approved AND q.total=doc."grandTotal" AND q.version=dd."currentQuoteVersion" AND dd.status<>'CANCELLED') OR
 EXISTS(SELECT 1 FROM "InvoiceDocumentLine" l LEFT JOIN "InvoiceDraftLine" dl ON dl."draftId"=d.id AND dl.ordinal=l.ordinal WHERE l."documentId"=target AND
 (l."orderItemId" IS NOT NULL OR l."variantId" IS NOT NULL OR l.quantity<>1 OR l."unitPrice"<>doc."grandTotal" OR l.discount<>0 OR dl.id IS NULL OR dl."variantId" IS NOT NULL OR dl.quantity<>1 OR dl."unitPrice"<>l."unitPrice" OR dl.discount<>0 OR l.sku<>dl.sku OR l.title<>dl.title OR
 l."netAmount"::numeric <> CASE WHEN p."taxTreatment"='INCLUSIVE' THEN round(l."unitPrice"::numeric*10000/(10000+p."taxRateBps")) ELSE l."unitPrice" END OR
 l.tax::numeric <> CASE WHEN p."taxTreatment"='EXEMPT' THEN 0 WHEN p."taxTreatment"='INCLUSIVE' THEN l."unitPrice"-l."netAmount" ELSE round(l."netAmount"::numeric*p."taxRateBps"/10000) END)))) OR
 doc."snapshot"->>'id' IS DISTINCT FROM doc."id" OR doc."snapshot"->>'number' IS DISTINCT FROM doc."number" OR
 doc."snapshot"->>'orderId' IS DISTINCT FROM o."id" OR doc."snapshot"->>'customerId' IS DISTINCT FROM doc."customerId" OR
 doc."snapshot"->>'buyerLabel' IS DISTINCT FROM d."buyerLabel" OR doc."snapshot"->'address' IS DISTINCT FROM d."addressSnapshot" OR doc."snapshot"->>'note' IS DISTINCT FROM d."note" OR
 doc."snapshot"->'seller' IS DISTINCT FROM jsonb_build_object('name',p."sellerName",'address',p."sellerAddress",'contact',p."sellerContact") OR
 doc."snapshot"->'taxPolicy' IS DISTINCT FROM jsonb_build_object('treatment',p."taxTreatment",'rateBps',p."taxRateBps",'exemptionReason',p."exemptionReason",'shippingTaxable',p."shippingTaxable") OR
 doc."snapshot"->'lines' IS DISTINCT FROM (SELECT jsonb_agg(jsonb_build_object('orderItemId',l."orderItemId",'variantId',l."variantId",'sku',l."sku",'title',l."title",'quantity',l."quantity",'unitPrice',jsonb_build_object('amount',l."unitPrice"::text,'currency','IRR'),
 'discount',jsonb_build_object('amount',l."discount"::text,'currency','IRR'),'netAmount',jsonb_build_object('amount',l."netAmount"::text,'currency','IRR'),'tax',jsonb_build_object('amount',l."tax"::text,'currency','IRR'),'total',jsonb_build_object('amount',l."total"::text,'currency','IRR')) ORDER BY l."ordinal") FROM "InvoiceDocumentLine" l WHERE l."documentId" = target) OR
 (doc."snapshot"#>>'{quote,total,amount}') IS DISTINCT FROM doc."grandTotal"::text OR
 (doc."snapshot"#>>'{quote,subtotal,amount}') IS DISTINCT FROM doc."subtotal"::text OR
 (doc."snapshot"#>>'{quote,discount,amount}') IS DISTINCT FROM doc."discount"::text OR
 (doc."snapshot"#>>'{quote,shipping,amount}') IS DISTINCT FROM doc."shipping"::text OR
 (doc."snapshot"#>>'{quote,netAmount,amount}') IS DISTINCT FROM doc."netAmount"::text OR
 (doc."snapshot"#>>'{quote,tax,amount}') IS DISTINCT FROM doc."tax"::text THEN
  RAISE EXCEPTION 'Immutable invoice source, number, policy and financial evidence does not reconcile' USING ERRCODE = '23514';
 END IF; RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION invoice_draft_reconcile() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE d "InvoiceDraft"%ROWTYPE; storage jsonb; actual jsonb; line_count integer; remaining numeric;
BEGIN
  SELECT * INTO d FROM "InvoiceDraft" WHERE "id" = NEW."id";
  SELECT "snapshot"->'storage' INTO storage FROM "InvoiceDraftRevision" WHERE "draftId" = d."id" AND "version" = d."version";
  SELECT count(*), sum("unitPrice"::numeric * "quantity" - "discount") INTO line_count, remaining FROM "InvoiceDraftLine" WHERE "draftId" = d."id";
  IF storage IS NULL OR line_count NOT BETWEEN 1 AND 50 OR remaining < d."globalDiscount" OR
    remaining - d."globalDiscount" + d."shippingAmount" > 9223372036854775807 OR
    (SELECT count(*) FROM "InvoiceDraftRevision" WHERE "draftId" = d."id") <> d."version"::bigint + 1 THEN
    RAISE EXCEPTION 'Draft must retain bounded lines and contiguous revision evidence' USING ERRCODE = '23514';
  END IF;
  actual := jsonb_build_object('id',d."id",'version',d."version",'state',d."state",'source',d."source",'customerId',d."customerId",'buyerLabel',d."buyerLabel",
    'sourceOrderId',d."sourceOrderId",'sourceOrderVersion',d."sourceOrderVersion",'sourceOrderHash',d."sourceOrderHash",'address',d."addressSnapshot",'note',d."note",'globalDiscount',d."globalDiscount"::text,
    'shippingCode',d."shippingCode",'shippingTitle',d."shippingTitle",'shippingAmount',d."shippingAmount"::text,'shippingPolicyRevision',d."shippingPolicyRevision",'pricePolicyRevision',d."pricePolicyRevision",
    'quoteExpiresEpoch',CASE WHEN d."quoteExpiresAt" IS NULL THEN NULL ELSE (extract(epoch from d."quoteExpiresAt") * 1000)::bigint::text END,'policyRevisionId',d."policyRevisionId",
    'lines',(SELECT jsonb_agg(jsonb_build_object('variantId',l."variantId",'ordinal',l."ordinal",'sku',l."sku",'title',l."title",'quantity',l."quantity",'unitPrice',l."unitPrice"::text,'discount',l."discount"::text) ORDER BY l."ordinal") FROM "InvoiceDraftLine" l WHERE l."draftId" = d."id"));
  IF d."doorQuoteId" IS NOT NULL THEN actual := actual || jsonb_build_object('doorQuoteId',d."doorQuoteId"); END IF;
  IF storage IS DISTINCT FROM actual THEN RAISE EXCEPTION 'Stored draft differs from immutable revision evidence' USING ERRCODE = '23514'; END IF;
  RETURN NULL;
END $$;
