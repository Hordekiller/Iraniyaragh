-- Each purpose needs its own approved copy; NULL remains allowed while disabled.
ALTER TABLE "SmsTemplateSettings" ADD CONSTRAINT "SmsTemplateSettings_distinct_ids_check" CHECK (
  ("otpTemplateId" IS NULL OR "orderPaidTemplateId" IS NULL OR "otpTemplateId" <> "orderPaidTemplateId") AND
  ("otpTemplateId" IS NULL OR "shipmentDispatchedTemplateId" IS NULL OR "otpTemplateId" <> "shipmentDispatchedTemplateId") AND
  ("otpTemplateId" IS NULL OR "shipmentDeliveredTemplateId" IS NULL OR "otpTemplateId" <> "shipmentDeliveredTemplateId") AND
  ("orderPaidTemplateId" IS NULL OR "shipmentDispatchedTemplateId" IS NULL OR "orderPaidTemplateId" <> "shipmentDispatchedTemplateId") AND
  ("orderPaidTemplateId" IS NULL OR "shipmentDeliveredTemplateId" IS NULL OR "orderPaidTemplateId" <> "shipmentDeliveredTemplateId") AND
  ("shipmentDispatchedTemplateId" IS NULL OR "shipmentDeliveredTemplateId" IS NULL OR "shipmentDispatchedTemplateId" <> "shipmentDeliveredTemplateId")
);
