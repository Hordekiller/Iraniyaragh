CREATE TYPE "MediaKind" AS ENUM ('IMAGE', 'VIDEO');
CREATE TYPE "MediaState" AS ENUM ('PENDING_UPLOAD', 'UPLOADED', 'PROCESSING', 'READY', 'FAILED', 'ARCHIVED');
CREATE TYPE "MediaRole" AS ENUM ('PRIMARY', 'GALLERY', 'VIDEO_POSTER');
CREATE TYPE "MediaRenditionPurpose" AS ENUM ('THUMBNAIL', 'CARD', 'DETAIL_SM', 'DETAIL_MD', 'DETAIL_LG', 'VIDEO_PLAYBACK');

CREATE TABLE "ProductMedia" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "kind" "MediaKind" NOT NULL,
    "state" "MediaState" NOT NULL DEFAULT 'PENDING_UPLOAD',
    "role" "MediaRole" NOT NULL DEFAULT 'GALLERY',
    "position" INTEGER NOT NULL,
    "altText" VARCHAR(300),
    "caption" VARCHAR(500),
    "objectKey" VARCHAR(512) NOT NULL,
    "originalFilename" VARCHAR(255) NOT NULL,
    "declaredMime" VARCHAR(100) NOT NULL,
    "detectedMime" VARCHAR(100),
    "bytes" BIGINT,
    "width" INTEGER,
    "height" INTEGER,
    "durationMs" INTEGER,
    "hasAudio" BOOLEAN,
    "posterMediaId" TEXT,
    "checksumSha256" CHAR(64),
    "failureCode" VARCHAR(100),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "uploadExpiresAt" TIMESTAMP(3) NOT NULL,
    "sourceDeleteAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProductMedia_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ProductMedia_position_check" CHECK ("position" >= 0),
    CONSTRAINT "ProductMedia_version_check" CHECK ("version" >= 1),
    CONSTRAINT "ProductMedia_verified_values_check" CHECK (
      ("bytes" IS NULL OR "bytes" > 0) AND
      ("width" IS NULL OR "width" > 0) AND
      ("height" IS NULL OR "height" > 0) AND
      ("durationMs" IS NULL OR "durationMs" > 0)
    ),
    CONSTRAINT "ProductMedia_primary_kind_check" CHECK ("role" <> 'PRIMARY' OR "kind" = 'IMAGE'),
    CONSTRAINT "ProductMedia_video_poster_role_check" CHECK ("role" <> 'VIDEO_POSTER' OR "kind" = 'IMAGE'),
    CONSTRAINT "ProductMedia_ready_metadata_check" CHECK (
      "state" <> 'READY' OR (
        "bytes" IS NOT NULL AND "width" IS NOT NULL AND "height" IS NOT NULL AND
        "detectedMime" IS NOT NULL AND "checksumSha256" IS NOT NULL AND
        (("kind" = 'IMAGE' AND "durationMs" IS NULL AND "hasAudio" IS NULL) OR
         ("kind" = 'VIDEO' AND "durationMs" IS NOT NULL AND "hasAudio" IS NOT NULL AND "posterMediaId" IS NOT NULL))
      )
    ),
    CONSTRAINT "ProductMedia_archive_timestamp_check" CHECK (("state" = 'ARCHIVED') = ("archivedAt" IS NOT NULL))
);

CREATE TABLE "ProductMediaRendition" (
    "id" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "purpose" "MediaRenditionPurpose" NOT NULL,
    "format" VARCHAR(30) NOT NULL,
    "objectKey" VARCHAR(512) NOT NULL,
    "bytes" BIGINT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "bitrate" INTEGER,
    "checksumSha256" CHAR(64) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductMediaRendition_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ProductMediaRendition_values_check" CHECK (
      "bytes" > 0 AND "width" > 0 AND "height" > 0 AND ("bitrate" IS NULL OR "bitrate" > 0)
    )
);

CREATE UNIQUE INDEX "ProductMedia_objectKey_key" ON "ProductMedia"("objectKey");
CREATE INDEX "ProductMedia_productId_state_position_idx" ON "ProductMedia"("productId", "state", "position");
CREATE INDEX "ProductMedia_state_uploadExpiresAt_idx" ON "ProductMedia"("state", "uploadExpiresAt");
CREATE INDEX "ProductMedia_posterMediaId_idx" ON "ProductMedia"("posterMediaId");
CREATE INDEX "ProductMedia_sourceDeleteAt_idx" ON "ProductMedia"("sourceDeleteAt");
CREATE INDEX "ProductMedia_archivedAt_idx" ON "ProductMedia"("archivedAt");
CREATE UNIQUE INDEX "ProductMedia_active_position_key" ON "ProductMedia"("productId", "position") WHERE "state" <> 'ARCHIVED';
CREATE UNIQUE INDEX "ProductMedia_active_primary_key" ON "ProductMedia"("productId") WHERE "role" = 'PRIMARY' AND "state" <> 'ARCHIVED';

CREATE UNIQUE INDEX "ProductMediaRendition_objectKey_key" ON "ProductMediaRendition"("objectKey");
CREATE UNIQUE INDEX "ProductMediaRendition_mediaId_purpose_format_key" ON "ProductMediaRendition"("mediaId", "purpose", "format");
CREATE INDEX "ProductMediaRendition_mediaId_idx" ON "ProductMediaRendition"("mediaId");

ALTER TABLE "ProductMedia" ADD CONSTRAINT "ProductMedia_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProductMedia" ADD CONSTRAINT "ProductMedia_posterMediaId_fkey"
  FOREIGN KEY ("posterMediaId") REFERENCES "ProductMedia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProductMedia" ADD CONSTRAINT "ProductMedia_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProductMediaRendition" ADD CONSTRAINT "ProductMediaRendition_mediaId_fkey"
  FOREIGN KEY ("mediaId") REFERENCES "ProductMedia"("id") ON DELETE CASCADE ON UPDATE CASCADE;
