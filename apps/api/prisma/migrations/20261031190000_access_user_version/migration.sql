-- Forward-only completion of the access administration schema. Existing user
-- and permission records retain their identity and receive the initial version.
ALTER TABLE "User" ADD COLUMN "accessVersion" INTEGER NOT NULL DEFAULT 1;
