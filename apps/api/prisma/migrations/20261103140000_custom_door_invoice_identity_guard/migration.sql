-- Null SKU/order-item references are a production-service capability, never a
-- relaxation of the existing retail invoice source identity invariant.
CREATE FUNCTION door_invoice_document_identity_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE production_quote text;
BEGIN
  SELECT d."doorQuoteId" INTO production_quote FROM "InvoiceDocument" doc
    JOIN "InvoiceDraft" d ON d.id=doc."draftId" WHERE doc.id=NEW."documentId";
  IF (production_quote IS NULL AND (NEW."orderItemId" IS NULL OR NEW."variantId" IS NULL)) OR
     (production_quote IS NOT NULL AND (NEW."orderItemId" IS NOT NULL OR NEW."variantId" IS NOT NULL)) THEN
    RAISE EXCEPTION 'Invoice line identity must match its retail or production service source' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER door_invoice_document_identity_guard BEFORE INSERT ON "InvoiceDocumentLine"
  FOR EACH ROW EXECUTE FUNCTION door_invoice_document_identity_guard();

CREATE FUNCTION door_confirmed_item_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target text; current_status "DoorProductionStatus";
BEGIN
  IF TG_OP='DELETE' THEN target:=OLD."orderId"; ELSE target:=NEW."orderId"; END IF;
  SELECT status INTO current_status FROM "DoorOrder" WHERE id=target FOR UPDATE;
  IF current_status<>'DRAFT' AND (TG_OP<>'INSERT' OR EXISTS(SELECT 1 FROM "DoorProductionRecord" WHERE "orderId"=target)) THEN
    RAISE EXCEPTION 'Confirmed production specifications are immutable' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' AND NEW."orderId" IS DISTINCT FROM OLD."orderId" THEN
    RAISE EXCEPTION 'A production item cannot change its owning order' USING ERRCODE='23514';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
CREATE TRIGGER door_confirmed_item_guard BEFORE INSERT OR UPDATE OR DELETE ON "DoorOrderItem"
  FOR EACH ROW EXECUTE FUNCTION door_confirmed_item_guard();
