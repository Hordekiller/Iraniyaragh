-- CreateTable
CREATE TABLE "InvoiceSeriesCounter" (
    "series" VARCHAR(16) NOT NULL,
    "period" INTEGER NOT NULL,
    "lastNumber" INTEGER NOT NULL,

    CONSTRAINT "InvoiceSeriesCounter_pkey" PRIMARY KEY ("series","period")
);

-- CreateTable
CREATE TABLE "InvoiceDocument" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "draftVersion" INTEGER NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderVersion" INTEGER NOT NULL,
    "customerId" TEXT NOT NULL,
    "policyRevisionId" TEXT NOT NULL,
    "series" VARCHAR(16) NOT NULL,
    "period" INTEGER NOT NULL,
    "sequence" INTEGER NOT NULL,
    "number" VARCHAR(40) NOT NULL,
    "subtotal" BIGINT NOT NULL,
    "discount" BIGINT NOT NULL,
    "shipping" BIGINT NOT NULL,
    "netAmount" BIGINT NOT NULL,
    "tax" BIGINT NOT NULL,
    "grandTotal" BIGINT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "payloadHash" CHAR(64) NOT NULL,
    "issuedById" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceDocumentLine" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "variantId" TEXT NOT NULL,
    "sku" VARCHAR(128) NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" BIGINT NOT NULL,
    "discount" BIGINT NOT NULL,
    "netAmount" BIGINT NOT NULL,
    "tax" BIGINT NOT NULL,
    "total" BIGINT NOT NULL,

    CONSTRAINT "InvoiceDocumentLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceDocumentEvent" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "action" VARCHAR(20) NOT NULL,
    "actorId" TEXT NOT NULL,
    "requestId" VARCHAR(100) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceDocumentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceIssueCommand" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "keyHash" CHAR(64) NOT NULL,
    "payloadHash" CHAR(64) NOT NULL,
    "documentId" TEXT NOT NULL,
    "committedVersion" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceIssueCommand_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceDocument_draftId_key" ON "InvoiceDocument"("draftId");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceDocument_orderId_key" ON "InvoiceDocument"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceDocument_number_key" ON "InvoiceDocument"("number");

-- CreateIndex
CREATE INDEX "InvoiceDocument_customerId_issuedAt_id_idx" ON "InvoiceDocument"("customerId", "issuedAt", "id");

-- CreateIndex
CREATE INDEX "InvoiceDocument_issuedAt_id_idx" ON "InvoiceDocument"("issuedAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceDocument_series_period_sequence_key" ON "InvoiceDocument"("series", "period", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceDocumentLine_documentId_ordinal_key" ON "InvoiceDocumentLine"("documentId", "ordinal");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceDocumentLine_documentId_orderItemId_key" ON "InvoiceDocumentLine"("documentId", "orderItemId");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceDocumentEvent_documentId_action_key" ON "InvoiceDocumentEvent"("documentId", "action");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceIssueCommand_actorId_draftId_keyHash_key" ON "InvoiceIssueCommand"("actorId", "draftId", "keyHash");

-- AddForeignKey
ALTER TABLE "InvoiceDocument" ADD CONSTRAINT "InvoiceDocument_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "InvoiceDraft"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceDocument" ADD CONSTRAINT "InvoiceDocument_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceDocument" ADD CONSTRAINT "InvoiceDocument_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceDocument" ADD CONSTRAINT "InvoiceDocument_policyRevisionId_fkey" FOREIGN KEY ("policyRevisionId") REFERENCES "InvoicePolicyRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceDocument" ADD CONSTRAINT "InvoiceDocument_series_period_fkey" FOREIGN KEY ("series", "period") REFERENCES "InvoiceSeriesCounter"("series", "period") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceDocument" ADD CONSTRAINT "InvoiceDocument_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceDocumentLine" ADD CONSTRAINT "InvoiceDocumentLine_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "InvoiceDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceDocumentLine" ADD CONSTRAINT "InvoiceDocumentLine_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceDocumentEvent" ADD CONSTRAINT "InvoiceDocumentEvent_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "InvoiceDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceDocumentEvent" ADD CONSTRAINT "InvoiceDocumentEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceIssueCommand" ADD CONSTRAINT "InvoiceIssueCommand_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceIssueCommand" ADD CONSTRAINT "InvoiceIssueCommand_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "InvoiceDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "InvoiceDraftRevision" DROP CONSTRAINT invoice_draft_revision_bounds;
ALTER TABLE "InvoiceDraftRevision" ADD CONSTRAINT invoice_draft_revision_bounds CHECK (
 "version" >= 0 AND "action" IN ('CREATED','EDITED','REQUOTED','CANCELLED','ISSUED') AND
 (("version" = 0 AND "action" = 'CREATED') OR ("version" > 0 AND "action" <> 'CREATED')) AND
 ("action" <> 'CANCELLED' OR length(btrim("reason")) > 0) AND length(btrim("requestId")) > 0 AND jsonb_typeof("snapshot") = 'object');
CREATE OR REPLACE FUNCTION invoice_draft_revision_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$ DECLARE d "InvoiceDraft"%ROWTYPE; BEGIN
 SELECT * INTO d FROM "InvoiceDraft" WHERE "id" = NEW."draftId" FOR UPDATE;
 IF NOT FOUND OR d."version" <> NEW."version" OR
 (SELECT count(*) FROM "InvoiceDraftRevision" WHERE "draftId" = d."id") <> NEW."version" OR
 (d."state" = 'CANCELLED') <> (NEW."action" = 'CANCELLED') OR
 (d."state" = 'ISSUED') <> (NEW."action" = 'ISSUED') THEN
  RAISE EXCEPTION 'Revision must seal the current contiguous draft state/version' USING ERRCODE = '23514';
 END IF; RETURN NEW;
END $$;
ALTER TABLE "InvoiceSeriesCounter" ADD CONSTRAINT invoice_counter_bounds CHECK ("series" = 'SALE' AND "period" BETWEEN 2000 AND 9999 AND "lastNumber" BETWEEN 1 AND 999999999);
ALTER TABLE "InvoiceDocument" ADD CONSTRAINT invoice_document_bounds CHECK (
 "draftVersion" > 0 AND "orderVersion" >= 0 AND "series" = 'SALE' AND "period" BETWEEN 2000 AND 9999 AND "sequence" BETWEEN 1 AND 999999999 AND
 "subtotal" >= 0 AND "discount" >= 0 AND "shipping" >= 0 AND "netAmount" >= 0 AND "tax" >= 0 AND "grandTotal" >= 0 AND
 "netAmount"::numeric + "tax"::numeric = "grandTotal"::numeric AND "payloadHash" ~ '^[a-f0-9]{64}$' AND jsonb_typeof("snapshot") = 'object');
ALTER TABLE "InvoiceDocumentLine" ADD CONSTRAINT invoice_document_line_bounds CHECK (
 "ordinal" BETWEEN 0 AND 49 AND "quantity" BETWEEN 1 AND 1000 AND "unitPrice" >= 0 AND "discount" >= 0 AND "netAmount" >= 0 AND "tax" >= 0 AND "total" >= 0 AND
 "unitPrice"::numeric * "quantity" <= 9223372036854775807 AND "discount"::numeric <= "unitPrice"::numeric * "quantity" AND "netAmount"::numeric + "tax"::numeric = "total"::numeric);
ALTER TABLE "InvoiceDocumentEvent" ADD CONSTRAINT invoice_document_event_bounds CHECK ("action" = 'ISSUED' AND length(btrim("requestId")) > 0);
ALTER TABLE "InvoiceIssueCommand" ADD CONSTRAINT invoice_issue_command_bounds CHECK ("committedVersion" > 0 AND "keyHash" ~ '^[a-f0-9]{64}$' AND "payloadHash" ~ '^[a-f0-9]{64}$');
CREATE TRIGGER invoice_document_immutable BEFORE UPDATE OR DELETE ON "InvoiceDocument" FOR EACH ROW EXECUTE FUNCTION invoice_draft_immutable();
CREATE TRIGGER invoice_document_line_immutable BEFORE UPDATE OR DELETE ON "InvoiceDocumentLine" FOR EACH ROW EXECUTE FUNCTION invoice_draft_immutable();
CREATE TRIGGER invoice_document_event_immutable BEFORE UPDATE OR DELETE ON "InvoiceDocumentEvent" FOR EACH ROW EXECUTE FUNCTION invoice_draft_immutable();
CREATE TRIGGER invoice_issue_command_immutable BEFORE UPDATE OR DELETE ON "InvoiceIssueCommand" FOR EACH ROW EXECUTE FUNCTION invoice_draft_immutable();

CREATE FUNCTION invoice_counter_step() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Issued numbers cannot be reset' USING ERRCODE = '23514'; END IF;
 IF (TG_OP = 'INSERT' AND NEW."lastNumber" <> 1) OR (TG_OP = 'UPDATE' AND (
 ROW(NEW."series",NEW."period") IS DISTINCT FROM ROW(OLD."series",OLD."period") OR NEW."lastNumber" <> OLD."lastNumber" + 1)) THEN
  RAISE EXCEPTION 'Invoice counter advances exactly once' USING ERRCODE = '23514';
 END IF; RETURN NEW;
END $$;
CREATE TRIGGER invoice_counter_step BEFORE INSERT OR UPDATE OR DELETE ON "InvoiceSeriesCounter" FOR EACH ROW EXECUTE FUNCTION invoice_counter_step();
CREATE FUNCTION invoice_counter_reconcile() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE current_number integer; BEGIN
 SELECT "lastNumber" INTO current_number FROM "InvoiceSeriesCounter" WHERE "series" = NEW."series" AND "period" = NEW."period";
 IF current_number IS DISTINCT FROM (SELECT max("sequence") FROM "InvoiceDocument" WHERE "series" = NEW."series" AND "period" = NEW."period") OR
 current_number IS DISTINCT FROM (SELECT count(*)::integer FROM "InvoiceDocument" WHERE "series" = NEW."series" AND "period" = NEW."period") THEN
  RAISE EXCEPTION 'Every committed store number requires an immutable document' USING ERRCODE = '23514';
 END IF; RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER invoice_counter_reconcile AFTER INSERT OR UPDATE ON "InvoiceSeriesCounter" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION invoice_counter_reconcile();
CREATE FUNCTION invoice_document_line_window() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 PERFORM "id" FROM "InvoiceDocument" WHERE "id" = NEW."documentId" FOR UPDATE;
 IF EXISTS (SELECT 1 FROM "InvoiceDocumentEvent" WHERE "documentId" = NEW."documentId" AND "action" = 'ISSUED') THEN
  RAISE EXCEPTION 'Issued invoice lines are sealed' USING ERRCODE = '23514';
 END IF; RETURN NEW;
END $$;
CREATE TRIGGER invoice_document_line_window BEFORE INSERT ON "InvoiceDocumentLine" FOR EACH ROW EXECUTE FUNCTION invoice_document_line_window();

CREATE FUNCTION invoice_document_reconcile() RETURNS trigger LANGUAGE plpgsql AS $$
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
 line_count NOT BETWEEN 1 AND 50 OR line_count <> (SELECT count(*) FROM "OrderItem" WHERE "orderId" = o."id") OR
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
CREATE CONSTRAINT TRIGGER invoice_document_reconcile AFTER INSERT ON "InvoiceDocument" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION invoice_document_reconcile();
CREATE CONSTRAINT TRIGGER invoice_document_line_reconcile AFTER INSERT ON "InvoiceDocumentLine" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION invoice_document_reconcile();
CREATE CONSTRAINT TRIGGER invoice_document_event_reconcile AFTER INSERT ON "InvoiceDocumentEvent" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION invoice_document_reconcile();
CREATE CONSTRAINT TRIGGER invoice_issue_command_reconcile AFTER INSERT ON "InvoiceIssueCommand" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION invoice_document_reconcile();
CREATE CONSTRAINT TRIGGER invoice_issued_draft_reconcile AFTER INSERT OR UPDATE ON "InvoiceDraft" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION invoice_document_reconcile();

INSERT INTO "Permission" ("id","key","name","description","group","isActive","createdAt","updatedAt")
VALUES ('migration_permission_invoices_issue','invoices.issue','Issue immutable store invoices','Canonical invoices.issue permission.','invoices',true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
INSERT INTO "AuditLog" ("id","action","entityType","entityId","metadata","createdAt")
SELECT 'migration_audit_register_invoices_issue','permission.registered','Permission',"id",'{"source":"20261013111000_invoice_documents"}'::jsonb,CURRENT_TIMESTAMP
FROM "Permission" WHERE "key" = 'invoices.issue' ON CONFLICT ("id") DO NOTHING;
WITH added AS (
 INSERT INTO "RolePermission" ("id","roleId","permissionId","grantedAt")
 SELECT 'migration_invoice_issue_grant_' || p."id" || '_' || r."id",r."id",p."id",CURRENT_TIMESTAMP FROM "Role" r CROSS JOIN "Permission" p
 WHERE r."key" = 'system-admin' AND r."isSystem" = true AND p."key" = 'invoices.issue'
 ON CONFLICT ("roleId","permissionId") DO NOTHING RETURNING "roleId","permissionId"
)
INSERT INTO "AuditLog" ("id","action","entityType","entityId","metadata","createdAt")
SELECT 'migration_invoice_issue_audit_' || "permissionId" || '_' || "roleId",'role.permission.granted','Role',"roleId",jsonb_build_object('permissionId',"permissionId",'source','20261013111000_invoice_documents'),CURRENT_TIMESTAMP FROM added;
