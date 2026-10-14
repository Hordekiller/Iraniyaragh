-- Bounded lock/scan budgets; failure aborts the official migration gate.
SET lock_timeout = '5s';
SET statement_timeout = '60s';
-- CreateIndex
CREATE INDEX "CreditLedgerEntry_effectiveAt_idx" ON "CreditLedgerEntry"("effectiveAt");

-- CreateIndex
CREATE INDEX "CreditRefundPayout_effectiveAt_idx" ON "CreditRefundPayout"("effectiveAt");

-- CreateIndex
CREATE INDEX "InvoiceDocument_issuedAt_idx" ON "InvoiceDocument"("issuedAt");

-- CreateIndex
CREATE INDEX "Payment_createdAt_idx" ON "Payment"("createdAt");

-- CreateIndex
CREATE INDEX "Refund_createdAt_idx" ON "Refund"("createdAt");


RESET lock_timeout;
RESET statement_timeout;
