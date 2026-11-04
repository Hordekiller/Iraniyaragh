-- Admin-managed promotional banners and per-user in-app notifications.
CREATE TYPE "InAppNotificationAudience" AS ENUM ('CUSTOMER', 'STAFF');

CREATE TABLE "HomepageBannerConfig" (
    "id" VARCHAR(32) NOT NULL DEFAULT 'storefront',
    "version" INTEGER NOT NULL DEFAULT 0,
    "banners" JSONB NOT NULL DEFAULT '[]',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "HomepageBannerConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HomepageBannerCommand" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "keyHash" CHAR(64) NOT NULL,
    "payloadHash" CHAR(64) NOT NULL,
    "response" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HomepageBannerCommand_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "HomepageBannerCommand_actorId_keyHash_key" ON "HomepageBannerCommand"("actorId", "keyHash");
ALTER TABLE "HomepageBannerCommand" ADD CONSTRAINT "HomepageBannerCommand_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "InAppNotification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "audience" "InAppNotificationAudience" NOT NULL,
    "kind" VARCHAR(64) NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "body" VARCHAR(400) NOT NULL,
    "href" VARCHAR(200),
    "dedupKey" VARCHAR(200) NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InAppNotification_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "InAppNotification_userId_dedupKey_key" ON "InAppNotification"("userId", "dedupKey");
CREATE INDEX "InAppNotification_userId_createdAt_id_idx" ON "InAppNotification"("userId", "createdAt" DESC, "id");
CREATE INDEX "InAppNotification_userId_readAt_idx" ON "InAppNotification"("userId", "readAt");
ALTER TABLE "InAppNotification" ADD CONSTRAINT "InAppNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
