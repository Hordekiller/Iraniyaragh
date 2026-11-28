-- Prisma's relation default uses ON UPDATE CASCADE. Align the hand-authored
-- projection foreign key so migration drift checks remain clean.
ALTER TABLE "SearchTerm" DROP CONSTRAINT "SearchTerm_documentId_fkey";
ALTER TABLE "SearchTerm" ADD CONSTRAINT "SearchTerm_documentId_fkey"
  FOREIGN KEY ("documentId") REFERENCES "SearchDocument"(id)
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Keep a normal B-tree term index so Prisma's drift check and PostgreSQL agree;
-- the trigram GIN index remains for longer fuzzy terms.
DROP INDEX "SearchTerm_prefix_idx";
CREATE INDEX "SearchTerm_prefix_idx" ON "SearchTerm" (term);
