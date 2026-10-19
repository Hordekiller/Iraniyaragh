-- Admin-managed category carousels for the public storefront homepage.
CREATE TABLE "HomepageCollectionConfig" (
    "id" VARCHAR(32) NOT NULL DEFAULT 'storefront',
    "version" INTEGER NOT NULL DEFAULT 0,
    "sections" JSONB NOT NULL DEFAULT '[]',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "HomepageCollectionConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HomepageCollectionCommand" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "keyHash" CHAR(64) NOT NULL,
    "payloadHash" CHAR(64) NOT NULL,
    "response" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HomepageCollectionCommand_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HomepageCollectionCommand_actorId_keyHash_key" ON "HomepageCollectionCommand"("actorId", "keyHash");

ALTER TABLE "HomepageCollectionCommand" ADD CONSTRAINT "HomepageCollectionCommand_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
