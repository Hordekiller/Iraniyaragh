import { createHash } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  type OnApplicationBootstrap,
  UnprocessableEntityException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type {
  SmsTemplateFields,
  SmsTemplateSettings,
  SmsTemplateSettingsUpdate,
} from "@iranyaragh/contracts";
import { Prisma } from "@prisma/client";
import { advisoryLockIdKey } from "../../common/advisory-lock";
import { PrismaService } from "../../database/prisma.service";
import type { SmsPurpose, SmsTemplateResolver } from "./sms-provider";

const SETTINGS_ID = "customer-sms";
const FIELDS = [
  "otpTemplateId",
  "orderPaidTemplateId",
  "shipmentDispatchedTemplateId",
  "shipmentDeliveredTemplateId",
] as const;
const ENVIRONMENT_FIELDS = [
  "SMS_IR_OTP_TEMPLATE_ID",
  "SMS_IR_ORDER_PAID_TEMPLATE_ID",
  "SMS_IR_SHIPMENT_DISPATCHED_TEMPLATE_ID",
  "SMS_IR_SHIPMENT_DELIVERED_TEMPLATE_ID",
] as const;
const PURPOSE_FIELD: Record<SmsPurpose, (typeof FIELDS)[number]> = {
  customer_login: "otpTemplateId",
  order_paid: "orderPaidTemplateId",
  shipment_dispatched: "shipmentDispatchedTemplateId",
  shipment_delivered: "shipmentDeliveredTemplateId",
};

function hasDistinctTemplates(settings: SmsTemplateFields): boolean {
  const configured = FIELDS.map((field) => settings[field]).filter(
    (value) => value !== null,
  );
  return new Set(configured).size === configured.length;
}

/** Non-secret configuration, read on dispatch so API/worker restarts are unnecessary. */
@Injectable()
export class SmsTemplateSettingsService
  implements SmsTemplateResolver, OnApplicationBootstrap
{
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!this.activeRealProvider()) return;
    const settings = await this.read();
    if (FIELDS.some((field) => settings[field] === null))
      throw new Error(
        "Active SMS delivery requires all four configured templates in Admin or the private environment.",
      );
    if (!hasDistinctTemplates(settings))
      throw new Error("SMS purposes require four distinct approved templates.");
  }

  private activeRealProvider(): boolean {
    return (
      ["staging", "production"].includes(this.config.get("NODE_ENV") ?? "") &&
      this.config.get("SMS_PROVIDER_MODE") !== "disabled"
    );
  }

  private environmentDefaults(): SmsTemplateSettings {
    const defaults = Object.fromEntries(
      FIELDS.map((field, index) => {
        const value = Number(this.config.get(ENVIRONMENT_FIELDS[index]!));
        return [
          field,
          Number.isSafeInteger(value) && value >= 1 && value <= 9_999_999_999
            ? value
            : null,
        ];
      }),
    ) as SmsTemplateFields;
    return { ...defaults, version: 0, updatedAt: null };
  }

  async read(): Promise<SmsTemplateSettings> {
    const row = await this.prisma.smsTemplateSettings.findUnique({
      where: { id: SETTINGS_ID },
    });
    if (!row) return this.environmentDefaults();
    return {
      otpTemplateId:
        row.otpTemplateId === null ? null : Number(row.otpTemplateId),
      orderPaidTemplateId:
        row.orderPaidTemplateId === null
          ? null
          : Number(row.orderPaidTemplateId),
      shipmentDispatchedTemplateId:
        row.shipmentDispatchedTemplateId === null
          ? null
          : Number(row.shipmentDispatchedTemplateId),
      shipmentDeliveredTemplateId:
        row.shipmentDeliveredTemplateId === null
          ? null
          : Number(row.shipmentDeliveredTemplateId),
      version: row.version,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async resolve(purpose: SmsPurpose): Promise<number | undefined> {
    return (await this.read())[PURPOSE_FIELD[purpose]] ?? undefined;
  }

  async update(
    actorId: string,
    requestId: string,
    input: SmsTemplateSettingsUpdate,
  ): Promise<SmsTemplateSettings> {
    const keyHash = createHash("sha256")
      .update(`sms-template-settings:${input.idempotencyKey}`)
      .digest("hex");
    const payloadHash = createHash("sha256")
      .update(
        JSON.stringify([
          input.expectedVersion,
          ...FIELDS.map((field) => input[field]),
        ]),
      )
      .digest("hex");
    return this.prisma.$transaction(async (tx) => {
      const [hi, lo] = advisoryLockIdKey("sms-template-settings");
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${hi}::int, ${lo}::int)`;
      const previous = await tx.smsTemplateCommandRecord.findUnique({
        where: { actorId_keyHash: { actorId, keyHash } },
      });
      if (previous) {
        if (previous.payloadHash !== payloadHash)
          throw new ConflictException({
            code: "CONFLICT",
            message:
              "Idempotency key was reused with different template settings.",
          });
        return previous.responseJson as unknown as SmsTemplateSettings;
      }
      if (
        this.activeRealProvider() &&
        FIELDS.some((field) => input[field] === null)
      )
        throw new UnprocessableEntityException({
          code: "OPERATION_UNSUPPORTED",
          message:
            "Disable SMS through deployment configuration before clearing an active template.",
        });
      if (!hasDistinctTemplates(input))
        throw new BadRequestException({
          code: "VALIDATION_ERROR",
          message: "Each SMS purpose requires a distinct approved template ID.",
        });
      const row = await tx.smsTemplateSettings.findUnique({
        where: { id: SETTINGS_ID },
      });
      if ((row?.version ?? 0) !== input.expectedVersion)
        throw new ConflictException({
          code: "CONFLICT",
          message: "Template settings changed. Reload before editing.",
        });
      const data = {
        otpTemplateId:
          input.otpTemplateId === null ? null : BigInt(input.otpTemplateId),
        orderPaidTemplateId:
          input.orderPaidTemplateId === null
            ? null
            : BigInt(input.orderPaidTemplateId),
        shipmentDispatchedTemplateId:
          input.shipmentDispatchedTemplateId === null
            ? null
            : BigInt(input.shipmentDispatchedTemplateId),
        shipmentDeliveredTemplateId:
          input.shipmentDeliveredTemplateId === null
            ? null
            : BigInt(input.shipmentDeliveredTemplateId),
        version: input.expectedVersion + 1,
      };
      const saved = row
        ? await tx.smsTemplateSettings.update({
            where: { id: SETTINGS_ID },
            data,
          })
        : await tx.smsTemplateSettings.create({
            data: { id: SETTINGS_ID, ...data },
          });
      const response: SmsTemplateSettings = {
        otpTemplateId: input.otpTemplateId,
        orderPaidTemplateId: input.orderPaidTemplateId,
        shipmentDispatchedTemplateId: input.shipmentDispatchedTemplateId,
        shipmentDeliveredTemplateId: input.shipmentDeliveredTemplateId,
        version: saved.version,
        updatedAt: saved.updatedAt.toISOString(),
      };
      await tx.smsTemplateCommandRecord.create({
        data: {
          actorId,
          keyHash,
          payloadHash,
          responseJson: response as Prisma.InputJsonObject,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId,
          requestId,
          action: "sms.templates.updated",
          entityType: "SmsTemplateSettings",
          entityId: SETTINGS_ID,
          metadata: {
            version: saved.version,
            configuredFields: FIELDS.filter((field) => input[field] !== null),
          },
        },
      });
      return response;
    });
  }
}
