CREATE TABLE "SmsTemplateSettings" (
  "id" VARCHAR(32) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "otpTemplateId" BIGINT,
  "orderPaidTemplateId" BIGINT,
  "shipmentDispatchedTemplateId" BIGINT,
  "shipmentDeliveredTemplateId" BIGINT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SmsTemplateSettings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SmsTemplateSettings_version_check" CHECK ("version" > 0),
  CONSTRAINT "SmsTemplateSettings_ids_check" CHECK (
    ("otpTemplateId" IS NULL OR "otpTemplateId" BETWEEN 1 AND 9999999999) AND
    ("orderPaidTemplateId" IS NULL OR "orderPaidTemplateId" BETWEEN 1 AND 9999999999) AND
    ("shipmentDispatchedTemplateId" IS NULL OR "shipmentDispatchedTemplateId" BETWEEN 1 AND 9999999999) AND
    ("shipmentDeliveredTemplateId" IS NULL OR "shipmentDeliveredTemplateId" BETWEEN 1 AND 9999999999)
  )
);
CREATE TABLE "SmsTemplateCommandRecord" (
  "id" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "keyHash" CHAR(64) NOT NULL,
  "payloadHash" CHAR(64) NOT NULL,
  "responseJson" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SmsTemplateCommandRecord_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SmsTemplateCommandRecord_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "SmsTemplateCommandRecord_actorId_keyHash_key" ON "SmsTemplateCommandRecord"("actorId", "keyHash");
