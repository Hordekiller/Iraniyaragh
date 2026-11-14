CREATE TABLE "HomepageHeroConfig" (
    "id" VARCHAR(32) NOT NULL DEFAULT 'storefront',
    "version" INTEGER NOT NULL DEFAULT 0,
    "slides" JSONB NOT NULL DEFAULT '[]',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "HomepageHeroConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HomepageHeroCommand" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "keyHash" CHAR(64) NOT NULL,
    "payloadHash" CHAR(64) NOT NULL,
    "response" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HomepageHeroCommand_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HomepageHeroCommand_actorId_keyHash_key" ON "HomepageHeroCommand"("actorId", "keyHash");
ALTER TABLE "HomepageHeroCommand" ADD CONSTRAINT "HomepageHeroCommand_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
