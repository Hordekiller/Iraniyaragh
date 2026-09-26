-- Keeps the denormalized running total honest: after every transaction, the
-- sum of recorded refunds must equal Payment.refundedAmount. Without this, a
-- write that inserts a Refund row without updating the payment would leave the
-- total that every read projects silently wrong.
CREATE OR REPLACE FUNCTION refund_total_matches_payment() RETURNS trigger AS $$
DECLARE
  target_payment_id text;
  recorded_total numeric;
  stored_total numeric;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF TG_TABLE_NAME = 'Refund' THEN
      target_payment_id := OLD."paymentId";
    ELSE
      target_payment_id := OLD.id;
    END IF;
  ELSE
    IF TG_TABLE_NAME = 'Refund' THEN
      target_payment_id := NEW."paymentId";
    ELSE
      target_payment_id := NEW.id;
    END IF;
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO recorded_total FROM "Refund" WHERE "paymentId" = target_payment_id;
  SELECT "refundedAmount" INTO stored_total FROM "Payment" WHERE id = target_payment_id;

  IF recorded_total <> stored_total THEN
    RAISE EXCEPTION 'Refund total % does not match the recorded refunds % for payment %',
      stored_total, recorded_total, target_payment_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER refund_total_consistency
  AFTER INSERT OR UPDATE OR DELETE ON "Refund"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION refund_total_matches_payment();

CREATE CONSTRAINT TRIGGER payment_refunded_total_consistency
  AFTER UPDATE OF "refundedAmount" ON "Payment"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION refund_total_matches_payment();
