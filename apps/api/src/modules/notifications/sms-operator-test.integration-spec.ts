import { createHash, randomUUID } from "node:crypto";
import { ConfigService } from "@nestjs/config";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { PrismaService } from "../../database/prisma.service";
import { assertIsolatedTestDatabase } from "../../test/database-url.guard";
import { SmsOperatorTestService } from "./sms-operator-test.service";
import { FakeSmsProvider } from "./fake-sms.provider";
import type { SmsSendResult } from "./sms-provider";

const values = {
  NODE_ENV: "staging",
  SMS_PROVIDER_MODE: "smsir",
  SMS_IR_API_KEY: "integration-only-key",
  SMS_IR_OTP_TEMPLATE_ID: 123,
  SMS_IR_TEST_SEND_ENABLED: true,
  SMS_IR_TEST_MOBILE: "+989121234567",
};

describe.sequential("SMS operator durable claims (isolated database)", () => {
  const prisma = new PrismaService();
  const keys: string[] = [];
  let connected = false;
  const key = () => {
    const value = randomUUID();
    keys.push(value);
    return value;
  };
  const hashes = () =>
    keys.map((value) =>
      createHash("sha256").update(`sms-operator-test:${value}`).digest("hex"),
    );
  const service = (
    provider: FakeSmsProvider,
    change: Record<string, unknown> = {},
  ) =>
    new SmsOperatorTestService(
      prisma,
      new ConfigService({ ...values, ...change }),
      provider,
    );

  beforeAll(async () => {
    assertIsolatedTestDatabase({
      databaseUrl: process.env.DATABASE_URL,
      nodeEnvironment: process.env.NODE_ENV,
    });
    await prisma.$connect();
    connected = true;
  });
  beforeEach(async () => {
    // Remove this suite's claims only, in a disposable database.
    await prisma.smsOperatorTestSend.deleteMany({
      where: { keyHash: { in: hashes() } },
    });
  });
  afterAll(async () => {
    if (connected)
      await prisma.smsOperatorTestSend.deleteMany({
        where: { keyHash: { in: hashes() } },
      });
    await prisma.$disconnect();
  });

  it("commits one uncertain claim before dispatch and deduplicates concurrent/restarted callers", async () => {
    const provider = new FakeSmsProvider();
    let release!: (value: SmsSendResult) => void;
    const send = vi.spyOn(provider, "send").mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const idempotencyKey = key();
    const first = service(provider).send(
      idempotencyKey,
      "integration-request-1",
    );
    await vi.waitFor(() => expect(send).toHaveBeenCalledOnce());
    const replay = await service(provider).send(
      idempotencyKey,
      "integration-request-2",
    );
    expect(replay).toEqual({ status: "unknown_result", messageId: null });
    expect(
      await prisma.smsOperatorTestSend.count({
        where: { keyHash: { in: hashes() } },
      }),
    ).toBe(1);
    release({ status: "accepted", providerMessageId: "42" });
    expect(await first).toEqual({ status: "accepted", messageId: "42" });
    expect(
      await service(provider).send(idempotencyKey, "integration-request-3"),
    ).toEqual({ status: "accepted", messageId: "42" });
    expect(send).toHaveBeenCalledOnce();
    const row = await prisma.smsOperatorTestSend.findUniqueOrThrow({
      where: { keyHash: hashes().at(-1)! },
    });
    for (const sensitive of [
      values.SMS_IR_API_KEY,
      values.SMS_IR_TEST_MOBILE,
      idempotencyKey,
    ])
      expect(JSON.stringify(row)).not.toContain(sensitive);
  });

  it.each([
    { status: "unknown_result" } as const,
    { status: "unavailable" } as const,
    { status: "rate_limited" } as const,
    { status: "rejected", reason: "template" } as const,
    { status: "disabled" } as const,
  ])(
    "never re-dispatches a persisted $status result after restart",
    async (result) => {
      const provider = new FakeSmsProvider(result);
      const idempotencyKey = key();
      const expected = {
        status: result.status === "disabled" ? "unavailable" : result.status,
        messageId: null,
      };
      expect(
        await service(provider).send(idempotencyKey, "integration-request-1"),
      ).toEqual(expected);
      expect(
        await service(provider).send(idempotencyKey, "integration-request-2"),
      ).toEqual(expected);
      expect(provider.requests).toHaveLength(1);
      const request = provider.requests[0];
      expect(request).toMatchObject({
        purpose: "customer_login",
        templateId: 123,
        destination: values.SMS_IR_TEST_MOBILE,
      });
      expect(Object.keys(request!.parameters)).toEqual(["Code"]);
      expect(request!.parameters.Code).toMatch(/^\d{6}$/u);
    },
  );

  it("never re-dispatches after a transport exception", async () => {
    const provider = new FakeSmsProvider();
    const send = vi
      .spyOn(provider, "send")
      .mockRejectedValue(new Error("private-error"));
    const idempotencyKey = key();
    expect(
      await service(provider).send(idempotencyKey, "integration-request-1"),
    ).toEqual({ status: "unknown_result", messageId: null });
    expect(
      await service(provider).send(idempotencyKey, "integration-request-2"),
    ).toEqual({ status: "unknown_result", messageId: null });
    expect(send).toHaveBeenCalledOnce();
  });

  it("enforces a durable global cooldown even with distinct concurrent keys", async () => {
    const provider = new FakeSmsProvider();
    const results = await Promise.allSettled([
      service(provider).send(key(), "integration-request-1"),
      service(provider).send(key(), "integration-request-2"),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.find((result) => result.status === "rejected"),
    ).toMatchObject({
      status: "rejected",
      reason: { status: 429, retryAfterSeconds: 60 },
    });
    expect(provider.requests).toHaveLength(1);
  });

  it("rejects key reuse after private destination/template/key changes", async () => {
    const provider = new FakeSmsProvider();
    const idempotencyKey = key();
    await service(provider).send(idempotencyKey, "integration-request-1");
    for (const change of [
      { SMS_IR_TEST_MOBILE: "+989121234568" },
      { SMS_IR_OTP_TEMPLATE_ID: 124 },
      { SMS_IR_API_KEY: "different-integration-key" },
    ])
      await expect(
        service(provider, change).send(idempotencyKey, "integration-request-2"),
      ).rejects.toMatchObject({ status: 409 });
    expect(provider.requests).toHaveLength(1);
  });

  it("preserves the uncertain claim when accepted-result persistence is lost", async () => {
    const provider = new FakeSmsProvider();
    const idempotencyKey = key();
    const update = vi
      .spyOn(prisma.smsOperatorTestSend, "update")
      .mockRejectedValueOnce(new Error("database-write-lost"));
    expect(
      await service(provider).send(idempotencyKey, "integration-request-1"),
    ).toEqual({ status: "accepted", messageId: "fake-message-1" });
    update.mockRestore();
    expect(
      await service(provider).send(idempotencyKey, "integration-request-2"),
    ).toEqual({ status: "unknown_result", messageId: null });
    expect(provider.requests).toHaveLength(1);
  });

  it.each([
    { SMS_IR_TEST_SEND_ENABLED: false },
    { SMS_IR_TEST_MOBILE: undefined },
    { SMS_IR_TEST_MOBILE: "09121234567" },
    { SMS_PROVIDER_MODE: "disabled" },
    { NODE_ENV: "development" },
    { SMS_IR_API_KEY: undefined },
    { SMS_IR_OTP_TEMPLATE_ID: 0 },
  ])(
    "fails closed before any provider or database claim without safe opt-in (%j)",
    async (change) => {
      const provider = new FakeSmsProvider();
      await expect(
        service(provider, change).send(key(), "integration-request-1"),
      ).rejects.toMatchObject({ status: 503 });
      expect(provider.requests).toHaveLength(0);
      expect(
        await prisma.smsOperatorTestSend.count({
          where: { keyHash: { in: hashes() } },
        }),
      ).toBe(0);
    },
  );
});
