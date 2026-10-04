import { createHash, createHmac, randomInt } from "node:crypto";
import {
  ConflictException,
  Inject,
  Injectable,
  Optional,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { SmsSendOutcome, SmsSendStatus } from "@iranyaragh/contracts";
import { advisoryLockIdKey } from "../../common/advisory-lock";
import { PrismaService } from "../../database/prisma.service";
import { RateLimitException } from "../auth/rate-limit.service";
import {
  SMS_PROVIDER,
  SMS_TEMPLATE_RESOLVER,
  type SmsTemplateResolver,
  type SmsProvider,
  type SmsSendResult,
} from "./sms-provider";

const COOLDOWN_SECONDS = 60;

/** Explicit, private operator opt-in. The random test code is not an auth challenge. */
@Injectable()
export class SmsOperatorTestService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(SMS_PROVIDER) private readonly provider: SmsProvider,
    @Optional() @Inject(SMS_TEMPLATE_RESOLVER) private readonly templates?: SmsTemplateResolver,
  ) {}

  async lastAcceptedAt(): Promise<string | null> {
    const [operator, customer] = await Promise.all([
      this.prisma.smsOperatorTestSend.findFirst({
        where: { status: "accepted", providerMessageId: { not: null } },
        orderBy: { updatedAt: "desc" },
        select: { updatedAt: true },
      }),
      this.prisma.outboxEffect.findFirst({
        where: {
          status: "COMPLETED",
          lastResultCode: "accepted",
          providerMessageId: { not: null },
          kind: {
            in: [
              "CUSTOMER_ORDER_PAID",
              "CUSTOMER_SHIPMENT_DISPATCHED",
              "CUSTOMER_SHIPMENT_DELIVERED",
            ],
          },
        },
        orderBy: { updatedAt: "desc" },
        select: { updatedAt: true },
      }),
    ]);
    const times = [operator?.updatedAt, customer?.updatedAt].filter(
      (value): value is Date => value !== undefined,
    );
    return times.length
      ? new Date(Math.max(...times.map((time) => time.getTime()))).toISOString()
      : null;
  }

  async send(
    idempotencyKey: string,
    requestId: string,
  ): Promise<SmsSendOutcome> {
    const environment = this.config.get<string>("NODE_ENV");
    const destination = this.config.get<string>("SMS_IR_TEST_MOBILE");
    const enabled = this.config.get<boolean | string>(
      "SMS_IR_TEST_SEND_ENABLED",
    );
    const apiKey = this.config.get<string>("SMS_IR_API_KEY");
    const templateId = this.templates ? await this.templates.resolve("customer_login") : Number(this.config.get("SMS_IR_OTP_TEMPLATE_ID"));
    if (
      !["staging", "production"].includes(environment ?? "") ||
      this.config.get("SMS_PROVIDER_MODE") !== "smsir" ||
      (enabled !== true && enabled !== "true") ||
      !destination ||
      !/^\+989\d{9}$/u.test(destination) ||
      !apiKey ||
      !Number.isSafeInteger(templateId) ||
      templateId === undefined ||
      templateId <= 0
    ) {
      throw new ServiceUnavailableException({
        code: "UPSTREAM_UNAVAILABLE",
        message:
          "Controlled SMS test send requires private operator opt-in and an approved destination/template.",
      });
    }
    const keyHash = createHash("sha256")
      .update(`sms-operator-test:${idempotencyKey}`)
      .digest("hex");
    // A keyed digest prevents a stored fingerprint from exposing the destination.
    const configurationHash = createHmac("sha256", apiKey)
      .update(JSON.stringify(["sms-operator-test-v1", destination, templateId]))
      .digest("hex");
    const claim = await this.prisma.$transaction(async (tx) => {
      const [hi, lo] = advisoryLockIdKey("sms-operator-test-global");
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${hi}::int, ${lo}::int)`;
      const existing = await tx.smsOperatorTestSend.findUnique({
        where: { keyHash },
      });
      if (existing) {
        if (existing.configurationHash !== configurationHash)
          throw new ConflictException({
            code: "CONFLICT",
            message: "Test configuration changed; this key cannot be reused.",
          });
        return {
          dispatch: false,
          outcome: {
            status: existing.status as SmsSendStatus,
            messageId: existing.providerMessageId,
          },
        };
      }
      const last = await tx.smsOperatorTestSend.findFirst({
        orderBy: { createdAt: "desc" },
      });
      if (
        last &&
        Date.now() - last.createdAt.getTime() < COOLDOWN_SECONDS * 1000
      )
        throw new RateLimitException(COOLDOWN_SECONDS);
      // Commit the uncertain claim before any external request. Restart never re-sends it.
      await tx.smsOperatorTestSend.create({
        data: { keyHash, configurationHash },
      });
      return {
        dispatch: true,
        outcome: { status: "unknown_result" as const, messageId: null },
      };
    });
    if (!claim.dispatch) return claim.outcome;
    let result: SmsSendResult;
    try {
      result = await this.provider.send({
        purpose: "customer_login",
        destination,
        templateId,
        parameters: { Code: String(randomInt(100_000, 1_000_000)) },
        correlationId: requestId,
      });
    } catch {
      result = { status: "unknown_result" };
    }
    if (result.status === "disabled") result = { status: "unavailable" };
    const outcome: SmsSendOutcome = {
      status: result.status,
      messageId: result.status === "accepted" ? result.providerMessageId : null,
    };
    // If evidence persistence fails, keep the durable uncertain claim: never resend.
    await this.prisma.smsOperatorTestSend
      .update({
        where: { keyHash },
        data: {
          status: outcome.status,
          providerMessageId: outcome.messageId,
        },
      })
      .catch(() => undefined);
    return outcome;
  }
}
