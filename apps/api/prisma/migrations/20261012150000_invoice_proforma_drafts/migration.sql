-- CreateEnum
CREATE TYPE "InvoiceDraftState" AS ENUM ('DRAFT', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InvoiceDraftSource" AS ENUM ('CATALOG', 'ORDER');

-- CreateTable
CREATE TABLE "InvoiceDraft" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "state" "InvoiceDraftState" NOT NULL DEFAULT 'DRAFT',
    "source" "InvoiceDraftSource" NOT NULL,
    "customerId" TEXT NOT NULL,
    "buyerLabel" VARCHAR(250) NOT NULL,
    "sourceOrderId" TEXT,
    "sourceOrderVersion" INTEGER,
    "sourceOrderHash" CHAR(64),
    "addressSnapshot" JSONB NOT NULL,
    "note" VARCHAR(500),
    "globalDiscount" BIGINT NOT NULL DEFAULT 0,
    "shippingCode" VARCHAR(64) NOT NULL,
    "shippingTitle" VARCHAR(120) NOT NULL,
    "shippingAmount" BIGINT NOT NULL,
    "shippingPolicyRevision" VARCHAR(100) NOT NULL,
    "pricePolicyRevision" VARCHAR(100) NOT NULL,
    "quoteExpiresAt" TIMESTAMP(3),
    "policyRevisionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvoiceDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceDraftLine" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "sku" VARCHAR(64) NOT NULL,
    "title" VARCHAR(250) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" BIGINT NOT NULL,
    "discount" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "InvoiceDraftLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceDraftRevision" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "action" VARCHAR(16) NOT NULL,
    "snapshot" JSONB NOT NULL,
    "reason" VARCHAR(500),
    "actorId" TEXT NOT NULL,
    "requestId" VARCHAR(100) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceDraftRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceDraftCommand" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "scope" VARCHAR(100) NOT NULL,
    "keyHash" CHAR(64) NOT NULL,
    "payloadHash" CHAR(64) NOT NULL,
    "draftId" TEXT NOT NULL,
    "committedVersion" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceDraftCommand_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InvoiceDraft_createdAt_id_idx" ON "InvoiceDraft"("createdAt", "id");

-- CreateIndex
CREATE INDEX "InvoiceDraft_customerId_createdAt_idx" ON "InvoiceDraft"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "InvoiceDraft_sourceOrderId_idx" ON "InvoiceDraft"("sourceOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceDraftLine_draftId_ordinal_key" ON "InvoiceDraftLine"("draftId", "ordinal");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceDraftLine_draftId_variantId_key" ON "InvoiceDraftLine"("draftId", "variantId");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceDraftRevision_draftId_version_key" ON "InvoiceDraftRevision"("draftId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceDraftCommand_actorId_scope_keyHash_key" ON "InvoiceDraftCommand"("actorId", "scope", "keyHash");

-- CreateIndex
CREATE UNIQUE INDEX "Order_id_customerId_key" ON "Order"("id", "customerId");

-- AddForeignKey
ALTER TABLE "InvoiceDraft" ADD CONSTRAINT "InvoiceDraft_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceDraft" ADD CONSTRAINT "InvoiceDraft_sourceOrderId_customerId_fkey" FOREIGN KEY ("sourceOrderId", "customerId") REFERENCES "Order"("id", "customerId") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "InvoiceDraft" ADD CONSTRAINT "InvoiceDraft_policyRevisionId_fkey" FOREIGN KEY ("policyRevisionId") REFERENCES "InvoicePolicyRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceDraftLine" ADD CONSTRAINT "InvoiceDraftLine_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "InvoiceDraft"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceDraftLine" ADD CONSTRAINT "InvoiceDraftLine_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceDraftRevision" ADD CONSTRAINT "InvoiceDraftRevision_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "InvoiceDraft"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceDraftRevision" ADD CONSTRAINT "InvoiceDraftRevision_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceDraftCommand" ADD CONSTRAINT "InvoiceDraftCommand_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "InvoiceDraft"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceDraftCommand" ADD CONSTRAINT "InvoiceDraftCommand_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceDraftCommand" ADD CONSTRAINT "InvoiceDraftCommand_draftId_committedVersion_fkey" FOREIGN KEY ("draftId", "committedVersion") REFERENCES "InvoiceDraftRevision"("draftId", "version") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- Independent quotations only: no writes to orders, payments, stock or receivables.
ALTER TABLE "InvoiceDraft" ADD CONSTRAINT invoice_draft_bounds CHECK (
  "version" >= 0 AND "globalDiscount" >= 0 AND "shippingAmount" >= 0 AND length(btrim("buyerLabel")) > 0 AND
  length(btrim("shippingCode")) > 0 AND length(btrim("shippingTitle")) > 0 AND length(btrim("pricePolicyRevision")) > 0 AND
  jsonb_typeof("addressSnapshot") = 'object' AND
  (("source" = 'CATALOG' AND "sourceOrderId" IS NULL AND "sourceOrderVersion" IS NULL AND "sourceOrderHash" IS NULL AND "quoteExpiresAt" IS NOT NULL) OR
   ("source" = 'ORDER' AND "sourceOrderId" IS NOT NULL AND "sourceOrderVersion" >= 0 AND "sourceOrderHash" ~ '^[a-f0-9]{64}$' AND "quoteExpiresAt" IS NULL)));
ALTER TABLE "InvoiceDraftLine" ADD CONSTRAINT invoice_draft_line_bounds CHECK (
  "ordinal" BETWEEN 0 AND 49 AND "quantity" BETWEEN 1 AND 1000 AND "unitPrice" >= 0 AND "discount" >= 0 AND
  "unitPrice"::numeric * "quantity" <= 9223372036854775807 AND "discount"::numeric <= "unitPrice"::numeric * "quantity" AND
  length(btrim("sku")) > 0 AND length(btrim("title")) > 0);
ALTER TABLE "InvoiceDraftRevision" ADD CONSTRAINT invoice_draft_revision_bounds CHECK (
  "version" >= 0 AND "action" IN ('CREATED','EDITED','REQUOTED','CANCELLED') AND
  (("version" = 0 AND "action" = 'CREATED') OR ("version" > 0 AND "action" <> 'CREATED')) AND
  ("action" <> 'CANCELLED' OR length(btrim("reason")) > 0) AND length(btrim("requestId")) > 0 AND jsonb_typeof("snapshot") = 'object');
ALTER TABLE "InvoiceDraftCommand" ADD CONSTRAINT invoice_draft_command_bounds CHECK (
  "committedVersion" >= 0 AND length(btrim("scope")) > 0 AND "keyHash" ~ '^[a-f0-9]{64}$' AND "payloadHash" ~ '^[a-f0-9]{64}$');
CREATE UNIQUE INDEX invoice_draft_active_source_order ON "InvoiceDraft"("sourceOrderId") WHERE "state" = 'DRAFT' AND "sourceOrderId" IS NOT NULL;

CREATE FUNCTION invoice_draft_immutable() RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN
  RAISE EXCEPTION 'Invoice draft history/commands are immutable' USING ERRCODE = '23514';
END $$;
CREATE TRIGGER invoice_draft_revision_immutable BEFORE UPDATE OR DELETE ON "InvoiceDraftRevision" FOR EACH ROW EXECUTE FUNCTION invoice_draft_immutable();
CREATE TRIGGER invoice_draft_command_immutable BEFORE UPDATE OR DELETE ON "InvoiceDraftCommand" FOR EACH ROW EXECUTE FUNCTION invoice_draft_immutable();
CREATE FUNCTION invoice_draft_identity_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Invoice drafts retain history' USING ERRCODE = '23514'; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW."version" <> 0 OR NEW."state" <> 'DRAFT' THEN RAISE EXCEPTION 'Draft begins at version zero' USING ERRCODE = '23514'; END IF;
  ELSE
    IF OLD."state" <> 'DRAFT' OR NEW."version"::bigint <> OLD."version"::bigint + 1 OR
       ROW(NEW."id",NEW."customerId",NEW."buyerLabel",NEW."source",NEW."sourceOrderId",NEW."sourceOrderHash",NEW."createdAt") IS DISTINCT FROM
       ROW(OLD."id",OLD."customerId",OLD."buyerLabel",OLD."source",OLD."sourceOrderId",OLD."sourceOrderHash",OLD."createdAt") THEN
      RAISE EXCEPTION 'Draft identity is immutable and every edit advances version' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER invoice_draft_identity BEFORE INSERT OR UPDATE OR DELETE ON "InvoiceDraft" FOR EACH ROW EXECUTE FUNCTION invoice_draft_identity_guard();

-- Lines can be changed only after advancing the draft version, before its immutable revision seals it.
CREATE FUNCTION invoice_draft_line_window() RETURNS TRIGGER LANGUAGE plpgsql AS $$ DECLARE d "InvoiceDraft"%ROWTYPE; target text; BEGIN
  IF TG_OP = 'DELETE' THEN target := OLD."draftId"; ELSE target := NEW."draftId"; END IF;
  IF TG_OP = 'UPDATE' AND NEW."draftId" <> OLD."draftId" THEN RAISE EXCEPTION 'Draft line ownership cannot change' USING ERRCODE = '23514'; END IF;
  SELECT * INTO d FROM "InvoiceDraft" WHERE "id" = target FOR UPDATE;
  IF NOT FOUND OR d."state" <> 'DRAFT' OR EXISTS(SELECT 1 FROM "InvoiceDraftRevision" WHERE "draftId" = target AND "version" = d."version") THEN
    RAISE EXCEPTION 'Draft lines require an open current revision' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER invoice_draft_line_window BEFORE INSERT OR UPDATE OR DELETE ON "InvoiceDraftLine" FOR EACH ROW EXECUTE FUNCTION invoice_draft_line_window();
CREATE FUNCTION invoice_draft_revision_guard() RETURNS TRIGGER LANGUAGE plpgsql AS $$ DECLARE d "InvoiceDraft"%ROWTYPE; BEGIN
  SELECT * INTO d FROM "InvoiceDraft" WHERE "id" = NEW."draftId" FOR UPDATE;
  IF NOT FOUND OR d."version" <> NEW."version" OR
    (SELECT count(*) FROM "InvoiceDraftRevision" WHERE "draftId" = d."id") <> NEW."version" OR
    (d."state" = 'CANCELLED') <> (NEW."action" = 'CANCELLED') THEN
    RAISE EXCEPTION 'Revision must seal the current contiguous draft version' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER invoice_draft_revision_guard BEFORE INSERT ON "InvoiceDraftRevision" FOR EACH ROW EXECUTE FUNCTION invoice_draft_revision_guard();
CREATE FUNCTION invoice_draft_reconcile() RETURNS TRIGGER LANGUAGE plpgsql AS $$
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
  IF storage IS DISTINCT FROM actual THEN RAISE EXCEPTION 'Stored draft differs from immutable revision evidence' USING ERRCODE = '23514'; END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER invoice_draft_reconcile AFTER INSERT OR UPDATE ON "InvoiceDraft" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION invoice_draft_reconcile();

INSERT INTO "Permission" ("id","key","name","description","group","isActive","createdAt","updatedAt")
SELECT 'migration_permission_' || replace(key,'.','_'), key, name, 'Canonical ' || key || ' permission.', 'invoices', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (VALUES ('invoices.read','Read invoices and independent drafts'), ('invoices.manage','Manage independent invoice drafts')) AS capabilities(key,name)
ON CONFLICT ("key") DO NOTHING;
INSERT INTO "AuditLog" ("id","action","entityType","entityId","metadata","createdAt")
SELECT 'migration_audit_register_' || replace("key",'.','_'), 'permission.registered', 'Permission', "id", '{"source":"20261012150000_invoice_proforma_drafts"}'::jsonb, CURRENT_TIMESTAMP
FROM "Permission" WHERE "key" IN ('invoices.read','invoices.manage') ON CONFLICT ("id") DO NOTHING;
WITH added AS (
  INSERT INTO "RolePermission" ("id","roleId","permissionId","grantedAt")
  SELECT 'migration_invoice_grant_' || p."id" || '_' || r."id", r."id", p."id", CURRENT_TIMESTAMP FROM "Role" r CROSS JOIN "Permission" p
  WHERE r."key" = 'system-admin' AND r."isSystem" = true AND p."key" IN ('invoices.read','invoices.manage')
  ON CONFLICT ("roleId","permissionId") DO NOTHING RETURNING "roleId","permissionId"
)
INSERT INTO "AuditLog" ("id","action","entityType","entityId","metadata","createdAt")
SELECT 'migration_invoice_grant_audit_' || "permissionId" || '_' || "roleId", 'role.permission.granted', 'Role', "roleId", jsonb_build_object('permissionId',"permissionId",'source','20261012150000_invoice_proforma_drafts'), CURRENT_TIMESTAMP FROM added;
