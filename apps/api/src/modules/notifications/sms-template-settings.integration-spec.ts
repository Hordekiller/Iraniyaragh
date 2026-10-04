import { randomUUID } from "node:crypto";
import { ConfigService } from "@nestjs/config";
import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import type { SmsTemplateSettingsUpdate } from "@iranyaragh/contracts";
import { PrismaService } from "../../database/prisma.service";
import { assertIsolatedTestDatabase } from "../../test/database-url.guard";
import { SmsTemplateSettingsService } from "./sms-template-settings.service";
import { SmsOperatorTestService } from "./sms-operator-test.service";
import { FakeSmsProvider } from "./fake-sms.provider";

const ENV = {
  NODE_ENV: "staging",
  SMS_PROVIDER_MODE: "disabled",
  SMS_IR_OTP_TEMPLATE_ID: 101,
  SMS_IR_ORDER_PAID_TEMPLATE_ID: 102,
  SMS_IR_SHIPMENT_DISPATCHED_TEMPLATE_ID: 103,
  SMS_IR_SHIPMENT_DELIVERED_TEMPLATE_ID: 104,
};
const input = (
  change: Partial<SmsTemplateSettingsUpdate> = {},
): SmsTemplateSettingsUpdate => ({
  otpTemplateId: 201,
  orderPaidTemplateId: 202,
  shipmentDispatchedTemplateId: 203,
  shipmentDeliveredTemplateId: 204,
  expectedVersion: 0,
  idempotencyKey: randomUUID(),
  ...change,
});

describe.sequential(
  "Admin SMS template configuration (isolated database)",
  () => {
    const prisma = new PrismaService();
    const actorId = `sms-template-test-${randomUUID()}`;
    const settings = (change: Record<string, unknown> = {}) =>
      new SmsTemplateSettingsService(
        prisma,
        new ConfigService({ ...ENV, ...change }),
      );
    let connected = false;
    async function clean() {
      await prisma.smsTemplateCommandRecord.deleteMany({ where: { actorId } });
      await prisma.auditLog.deleteMany({
        where: { actorId, action: "sms.templates.updated" },
      });
      await prisma.smsTemplateSettings.deleteMany({
        where: { id: "customer-sms" },
      });
    }
    beforeAll(async () => {
      assertIsolatedTestDatabase({
        databaseUrl: process.env.DATABASE_URL,
        nodeEnvironment: process.env.NODE_ENV,
      });
      await prisma.$connect();
      connected = true;
      await prisma.user.create({
        data: { id: actorId, email: `${actorId}@example.invalid` },
      });
    });
    beforeEach(clean);
    afterAll(async () => {
      if (connected) {
        await clean();
        await prisma.user.deleteMany({ where: { id: actorId } });
      }
      await prisma.$disconnect();
    });

    it("uses environment fallback until the first persisted configuration, then treats null as authoritative", async () => {
      expect(await settings().read()).toMatchObject({
        version: 0,
        otpTemplateId: 101,
      });
      await settings().update(
        actorId,
        "request-save",
        input({ otpTemplateId: null }),
      );
      expect(await settings().resolve("customer_login")).toBeUndefined();
      expect(
        await settings({ SMS_IR_ORDER_PAID_TEMPLATE_ID: 999 }).resolve(
          "order_paid",
        ),
      ).toBe(202);
    });

    it("reloads and dispatches all four saved templates without a process restart", async () => {
      const reader = settings();
      expect(await reader.resolve("shipment_delivered")).toBe(104);
      const saved = await settings().update(actorId, "request-save", input());
      expect(saved.version).toBe(1);
      expect(await reader.read()).toEqual(saved);
      expect(
        await Promise.all(
          [
            "customer_login",
            "order_paid",
            "shipment_dispatched",
            "shipment_delivered",
          ].map((p) => reader.resolve(p as "customer_login")),
        ),
      ).toEqual([201, 202, 203, 204]);
    });

    it("deduplicates concurrent repeated submits and returns the original response after restart and later edits", async () => {
      const first = input();
      const responses = await Promise.all([
        settings().update(actorId, "request-1", first),
        settings().update(actorId, "request-2", first),
      ]);
      expect(responses[0]).toEqual(responses[1]);
      await settings().update(
        actorId,
        "request-3",
        input({ expectedVersion: 1, otpTemplateId: 301 }),
      );
      expect(await settings().update(actorId, "request-replay", first)).toEqual(
        responses[0],
      );
      expect((await settings().read()).otpTemplateId).toBe(301);
      expect(
        await prisma.auditLog.count({
          where: { actorId, action: "sms.templates.updated" },
        }),
      ).toBe(2);
    });

    it("has one winner for concurrent different commands with the same expected version", async () => {
      const results = await Promise.allSettled([
        settings().update(actorId, "request-1", input()),
        settings().update(actorId, "request-2", input({ otpTemplateId: 301 })),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(results.find((r) => r.status === "rejected")).toMatchObject({
        reason: { status: 409 },
      });
      expect(
        await prisma.smsTemplateCommandRecord.count({ where: { actorId } }),
      ).toBe(1);
      expect((await settings().read()).version).toBe(1);
    });

    it("rejects stale versions and reuse of an idempotency key for a different payload", async () => {
      const first = input();
      await settings().update(actorId, "request-1", first);
      await expect(
        settings().update(actorId, "request-2", {
          ...first,
          otpTemplateId: 999,
        }),
      ).rejects.toMatchObject({ status: 409 });
      await expect(
        settings().update(actorId, "request-3", input()),
      ).rejects.toMatchObject({ status: 409 });
      expect((await settings().read()).otpTemplateId).toBe(201);
    });

    it("fails boot closed for any missing active template, accepts DB-only configuration, and forbids clearing active IDs", async () => {
      await settings().update(
        actorId,
        "request-prepare",
        input({ otpTemplateId: null }),
      );
      await expect(
        settings({ SMS_PROVIDER_MODE: "smsir" }).onApplicationBootstrap(),
      ).rejects.toThrow("all four");
      await settings().update(
        actorId,
        "request-complete",
        input({ expectedVersion: 1 }),
      );
      await expect(
        settings({
          SMS_PROVIDER_MODE: "smsir",
          ...Object.fromEntries(
            Object.keys(ENV)
              .filter((k) => k.endsWith("_TEMPLATE_ID"))
              .map((k) => [k, undefined]),
          ),
        }).onApplicationBootstrap(),
      ).resolves.toBeUndefined();
      await expect(
        settings({ SMS_PROVIDER_MODE: "smsir" }).update(
          actorId,
          "request-clear",
          input({ expectedVersion: 2, shipmentDispatchedTemplateId: null }),
        ),
      ).rejects.toMatchObject({ status: 422 });
      expect((await settings().read()).version).toBe(2);
    });

    it("replays an old successful preparation command even after activation, without clearing the current active template", async () => {
      const preparation = input({ otpTemplateId: null });
      const original = await settings().update(
        actorId,
        "request-prepare",
        preparation,
      );
      await settings().update(
        actorId,
        "request-complete",
        input({ expectedVersion: 1 }),
      );
      expect(
        await settings({ SMS_PROVIDER_MODE: "smsir" }).update(
          actorId,
          "request-replay",
          preparation,
        ),
      ).toEqual(original);
      expect((await settings().read()).otpTemplateId).toBe(201);
    });

    it("rolls back settings and audit atomically if the actor cannot be recorded", async () => {
      await expect(
        settings().update("missing-actor", "request-invalid", input()),
      ).rejects.toThrow();
      expect((await settings().read()).version).toBe(0);
      expect(
        await prisma.smsTemplateCommandRecord.count({ where: { actorId } }),
      ).toBe(0);
    });

    it("stores only non-secret template IDs and safe audit field names", async () => {
      const request = input();
      const privateKey = "unit-only-private-key";
      await settings({ SMS_IR_API_KEY: privateKey }).update(
        actorId,
        "request-safe",
        request,
      );
      const evidence = JSON.stringify(
        await prisma.auditLog.findMany({ where: { actorId } }),
      );
      expect(evidence).toContain("otpTemplateId");
      expect(evidence).not.toContain(privateKey);
      expect(evidence).not.toContain(request.idempotencyKey);
      expect(evidence).not.toContain("201");
    });

    it("controlled operator sends resolve the saved OTP template rather than a stale environment ID", async () => {
      await settings().update(actorId, "request-configure", input());
      const provider = new FakeSmsProvider();
      const config = new ConfigService({
        ...ENV,
        SMS_PROVIDER_MODE: "smsir",
        SMS_IR_API_KEY: "unit-only-private-key",
        SMS_IR_TEST_SEND_ENABLED: true,
        SMS_IR_TEST_MOBILE: "+989120000000",
      });
      const key = randomUUID();
      try {
        await new SmsOperatorTestService(
          prisma,
          config,
          provider,
          settings(),
        ).send(key, "request-send");
        expect(provider.requests).toHaveLength(1);
        expect(provider.requests[0]?.templateId).toBe(201);
      } finally {
        const { createHash } = await import("node:crypto");
        await prisma.smsOperatorTestSend.deleteMany({
          where: {
            keyHash: createHash("sha256")
              .update(`sms-operator-test:${key}`)
              .digest("hex"),
          },
        });
      }
    });
  },
);
