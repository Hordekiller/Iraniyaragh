-- Governed blog articles with revision history, slug redirects and idempotent commands.
CREATE TYPE "BlogPostStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'PUBLISHED', 'ARCHIVED');

CREATE TABLE "BlogPost" (
    "id" TEXT NOT NULL,
    "slug" VARCHAR(250) NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "excerpt" VARCHAR(400) NOT NULL,
    "bodyHtml" TEXT NOT NULL,
    "coverMediaId" TEXT,
    "coverAlt" VARCHAR(200),
    "tags" TEXT[],
    "seoTitle" VARCHAR(70),
    "seoDescription" VARCHAR(200),
    "sources" JSONB NOT NULL DEFAULT '[]',
    "status" "BlogPostStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "authorId" TEXT NOT NULL,
    "reviewerId" TEXT,
    "publishedAt" TIMESTAMP(3),
    "contentUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BlogPost_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "BlogPost_slug_key" ON "BlogPost"("slug");
CREATE INDEX "BlogPost_status_publishedAt_id_idx" ON "BlogPost"("status", "publishedAt" DESC, "id");
CREATE INDEX "BlogPost_updatedAt_idx" ON "BlogPost"("updatedAt");
ALTER TABLE "BlogPost" ADD CONSTRAINT "BlogPost_coverMediaId_fkey" FOREIGN KEY ("coverMediaId") REFERENCES "ProductMedia"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BlogPost" ADD CONSTRAINT "BlogPost_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BlogPost" ADD CONSTRAINT "BlogPost_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- A published article always has a go-live time; versions start at 1.
ALTER TABLE "BlogPost" ADD CONSTRAINT "BlogPost_published_has_time" CHECK ("status" <> 'PUBLISHED' OR "publishedAt" IS NOT NULL);
ALTER TABLE "BlogPost" ADD CONSTRAINT "BlogPost_version_positive" CHECK ("version" >= 1);

CREATE TABLE "BlogPostSlug" (
    "slug" VARCHAR(250) NOT NULL,
    "postId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BlogPostSlug_pkey" PRIMARY KEY ("slug")
);
CREATE INDEX "BlogPostSlug_postId_idx" ON "BlogPostSlug"("postId");
ALTER TABLE "BlogPostSlug" ADD CONSTRAINT "BlogPostSlug_postId_fkey" FOREIGN KEY ("postId") REFERENCES "BlogPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "BlogPostRevision" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BlogPostRevision_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "BlogPostRevision_postId_version_key" ON "BlogPostRevision"("postId", "version");
ALTER TABLE "BlogPostRevision" ADD CONSTRAINT "BlogPostRevision_postId_fkey" FOREIGN KEY ("postId") REFERENCES "BlogPost"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BlogPostRevision" ADD CONSTRAINT "BlogPostRevision_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "BlogCommand" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "keyHash" CHAR(64) NOT NULL,
    "payloadHash" CHAR(64) NOT NULL,
    "response" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BlogCommand_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "BlogCommand_actorId_keyHash_key" ON "BlogCommand"("actorId", "keyHash");
ALTER TABLE "BlogCommand" ADD CONSTRAINT "BlogCommand_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
