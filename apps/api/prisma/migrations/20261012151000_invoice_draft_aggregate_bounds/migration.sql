-- Forward guard extension: signed-BIGINT gross totals and contiguous ordered lines.
CREATE FUNCTION invoice_draft_aggregate_bounds() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE line_count integer; gross numeric; first_ordinal integer; last_ordinal integer;
BEGIN
  SELECT count(*), sum("unitPrice"::numeric * "quantity"), min("ordinal"), max("ordinal")
    INTO line_count, gross, first_ordinal, last_ordinal FROM "InvoiceDraftLine" WHERE "draftId" = NEW."id";
  IF line_count NOT BETWEEN 1 AND 50 OR gross > 9223372036854775807 OR first_ordinal <> 0 OR last_ordinal <> line_count - 1 THEN
    RAISE EXCEPTION 'Draft gross total/line order exceeds accepted contract' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER invoice_draft_aggregate_bounds AFTER INSERT OR UPDATE ON "InvoiceDraft"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION invoice_draft_aggregate_bounds();
