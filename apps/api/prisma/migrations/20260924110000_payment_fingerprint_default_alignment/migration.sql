-- Align migration history with the datamodel: the Payment initiation
-- migration declared a `DEFAULT ''` for idempotencyFingerprint so the NOT NULL
-- column could be added to an already-populated Payment table, but the schema
-- carries no DB default (the service always writes the SHA-256 hash).
--
-- Dropping the default keeps the migration history and the schema datamodel in
-- agreement with each other (CI drift gate runs `prisma migrate diff --exit-code`).
ALTER TABLE "Payment" ALTER COLUMN "idempotencyFingerprint" DROP DEFAULT;