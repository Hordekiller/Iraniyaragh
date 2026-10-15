-- CreateTable
CREATE TABLE "InvoicePublication" (
    "documentId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "isPublished" BOOLEAN NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoicePublication_pkey" PRIMARY KEY ("documentId")
);

-- CreateTable
CREATE TABLE "InvoicePublicationEvent" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "isPublished" BOOLEAN NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "actorId" TEXT NOT NULL,
    "requestId" VARCHAR(100) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoicePublicationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoicePublicationCommand" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "keyHash" CHAR(64) NOT NULL,
    "payloadHash" CHAR(64) NOT NULL,
    "eventId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoicePublicationCommand_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InvoicePublicationEvent_documentId_version_key" ON "InvoicePublicationEvent"("documentId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "InvoicePublicationCommand_eventId_key" ON "InvoicePublicationCommand"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "InvoicePublicationCommand_actorId_documentId_keyHash_key" ON "InvoicePublicationCommand"("actorId", "documentId", "keyHash");

-- AddForeignKey
ALTER TABLE "InvoicePublication" ADD CONSTRAINT "InvoicePublication_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "InvoiceDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoicePublicationEvent" ADD CONSTRAINT "InvoicePublicationEvent_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "InvoiceDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoicePublicationEvent" ADD CONSTRAINT "InvoicePublicationEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoicePublicationCommand" ADD CONSTRAINT "InvoicePublicationCommand_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "InvoiceDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoicePublicationCommand" ADD CONSTRAINT "InvoicePublicationCommand_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoicePublicationCommand" ADD CONSTRAINT "InvoicePublicationCommand_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "InvoicePublicationEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "InvoicePublication" ADD CONSTRAINT invoice_publication_bounds CHECK ("version" BETWEEN 1 AND 2147483647);
ALTER TABLE "InvoicePublicationEvent" ADD CONSTRAINT invoice_publication_event_bounds CHECK ("version" BETWEEN 1 AND 2147483647 AND length(btrim("reason")) > 0 AND length(btrim("requestId")) > 0);
ALTER TABLE "InvoicePublicationCommand" ADD CONSTRAINT invoice_publication_command_bounds CHECK ("keyHash" ~ '^[a-f0-9]{64}$' AND "payloadHash" ~ '^[a-f0-9]{64}$');
CREATE TRIGGER invoice_publication_event_immutable BEFORE UPDATE OR DELETE ON "InvoicePublicationEvent" FOR EACH ROW EXECUTE FUNCTION invoice_draft_immutable();
CREATE TRIGGER invoice_publication_command_immutable BEFORE UPDATE OR DELETE ON "InvoicePublicationCommand" FOR EACH ROW EXECUTE FUNCTION invoice_draft_immutable();
CREATE FUNCTION invoice_publication_step() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Publication history cannot be removed' USING ERRCODE='23514'; END IF;
 PERFORM "id" FROM "InvoiceDocument" WHERE "id"=NEW."documentId" FOR UPDATE;
 IF (TG_OP='INSERT' AND (NEW."version"<>1 OR NOT NEW."isPublished")) OR
 (TG_OP='UPDATE' AND (NEW."documentId" IS DISTINCT FROM OLD."documentId" OR NEW."version"<>OLD."version"+1 OR NEW."isPublished"=OLD."isPublished")) THEN
  RAISE EXCEPTION 'Publication requires one explicit versioned visibility change' USING ERRCODE='23514';
 END IF; RETURN NEW;
END $$;
CREATE TRIGGER invoice_publication_step BEFORE INSERT OR UPDATE OR DELETE ON "InvoicePublication" FOR EACH ROW EXECUTE FUNCTION invoice_publication_step();
CREATE FUNCTION invoice_publication_event_guard() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE head "InvoicePublication"%ROWTYPE; BEGIN
 SELECT * INTO head FROM "InvoicePublication" WHERE "documentId"=NEW."documentId" FOR UPDATE;
 IF NOT FOUND OR head."version"<>NEW."version" OR head."isPublished"<>NEW."isPublished" OR
 (SELECT count(*) FROM "InvoicePublicationEvent" WHERE "documentId"=NEW."documentId")<>NEW."version"-1 THEN
  RAISE EXCEPTION 'Publication event must seal the current contiguous state' USING ERRCODE='23514';
 END IF; RETURN NEW;
END $$;
CREATE TRIGGER invoice_publication_event_guard BEFORE INSERT ON "InvoicePublicationEvent" FOR EACH ROW EXECUTE FUNCTION invoice_publication_event_guard();
CREATE FUNCTION invoice_publication_reconcile() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE head "InvoicePublication"%ROWTYPE; latest "InvoicePublicationEvent"%ROWTYPE; BEGIN
 SELECT * INTO head FROM "InvoicePublication" WHERE "documentId"=NEW."documentId";
 SELECT * INTO latest FROM "InvoicePublicationEvent" WHERE "documentId"=NEW."documentId" ORDER BY "version" DESC LIMIT 1;
 IF head."documentId" IS NULL OR latest."id" IS NULL OR head."version"<>latest."version" OR head."isPublished"<>latest."isPublished" OR head."updatedAt"<>latest."createdAt" OR
 (SELECT count(*) FROM "InvoicePublicationEvent" WHERE "documentId"=NEW."documentId")<>head."version" OR
 (SELECT count(*) FROM "InvoicePublicationCommand" WHERE "documentId"=NEW."documentId")<>head."version" OR
 EXISTS(SELECT 1 FROM "InvoicePublicationCommand" c JOIN "InvoicePublicationEvent" e ON e."id"=c."eventId" WHERE c."documentId"=NEW."documentId" AND (c."documentId"<>e."documentId" OR c."actorId"<>e."actorId")) OR
 EXISTS(SELECT 1 FROM "InvoicePublicationEvent" e WHERE e."documentId"=NEW."documentId" AND NOT EXISTS(SELECT 1 FROM "InvoicePublicationCommand" WHERE "eventId"=e."id" AND "documentId"=e."documentId" AND "actorId"=e."actorId")) THEN
  RAISE EXCEPTION 'Publication head/event/command evidence does not reconcile' USING ERRCODE='23514';
 END IF; RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER invoice_publication_reconcile AFTER INSERT OR UPDATE ON "InvoicePublication" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION invoice_publication_reconcile();
CREATE CONSTRAINT TRIGGER invoice_publication_event_reconcile AFTER INSERT ON "InvoicePublicationEvent" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION invoice_publication_reconcile();
CREATE CONSTRAINT TRIGGER invoice_publication_command_reconcile AFTER INSERT ON "InvoicePublicationCommand" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION invoice_publication_reconcile();
INSERT INTO "Permission" ("id","key","name","description","group","isActive","createdAt","updatedAt")
VALUES ('migration_permission_invoices_publish','invoices.publish','Publish customer invoice access','Canonical invoices.publish permission.','invoices',true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT ("key") DO NOTHING;
INSERT INTO "AuditLog" ("id","action","entityType","entityId","metadata","createdAt")
SELECT 'migration_audit_register_invoices_publish','permission.registered','Permission',"id",'{"source":"20261013130000_invoice_publication"}'::jsonb,CURRENT_TIMESTAMP
FROM "Permission" WHERE "key"='invoices.publish' ON CONFLICT ("id") DO NOTHING;
WITH added AS (
 INSERT INTO "RolePermission" ("id","roleId","permissionId","grantedAt")
 SELECT 'migration_invoice_publish_grant_'||p."id"||'_'||r."id",r."id",p."id",CURRENT_TIMESTAMP FROM "Role" r CROSS JOIN "Permission" p
 WHERE r."key"='system-admin' AND r."isSystem"=true AND p."key"='invoices.publish'
 ON CONFLICT ("roleId","permissionId") DO NOTHING RETURNING "roleId","permissionId"
)
INSERT INTO "AuditLog" ("id","action","entityType","entityId","metadata","createdAt")
SELECT 'migration_invoice_publish_audit_'||"permissionId"||'_'||"roleId",'role.permission.granted','Role',"roleId",jsonb_build_object('permissionId',"permissionId",'source','20261013130000_invoice_publication'),CURRENT_TIMESTAMP FROM added;
