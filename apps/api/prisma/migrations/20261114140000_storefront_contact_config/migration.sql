CREATE TABLE "StorefrontContactConfig" (
    "id" VARCHAR(32) NOT NULL DEFAULT 'storefront',
    "version" INTEGER NOT NULL DEFAULT 0,
    "links" JSONB NOT NULL DEFAULT '[]',
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StorefrontContactConfig_pkey" PRIMARY KEY ("id")
);
