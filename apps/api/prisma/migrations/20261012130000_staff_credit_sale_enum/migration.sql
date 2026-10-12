-- Add enum labels separately: PostgreSQL cannot use a new label in the same transaction.
ALTER TYPE "OrderStatus" ADD VALUE 'CREDIT_APPROVED';
ALTER TYPE "ReceivableDocumentKind" ADD VALUE 'SALE';
ALTER TYPE "CreditEntryKind" ADD VALUE 'SALE';
