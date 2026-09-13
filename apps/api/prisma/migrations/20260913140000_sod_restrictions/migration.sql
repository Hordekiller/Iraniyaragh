-- CreateTable
CREATE TABLE "SoDRestriction" (
    "id" TEXT NOT NULL,
    "key" VARCHAR(100) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "description" TEXT NOT NULL,
    "permissionKeys" VARCHAR(150)[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SoDRestriction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SoDRestriction_key_key" ON "SoDRestriction"("key");

-- CreateIndex
CREATE INDEX "SoDRestriction_isActive_idx" ON "SoDRestriction"("isActive");