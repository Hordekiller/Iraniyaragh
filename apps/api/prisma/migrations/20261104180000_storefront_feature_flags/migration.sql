-- Admin-managed on/off switches for optional storefront features.
CREATE TABLE "StorefrontFeatureFlag" (
    "key" VARCHAR(64) NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StorefrontFeatureFlag_pkey" PRIMARY KEY ("key")
);
