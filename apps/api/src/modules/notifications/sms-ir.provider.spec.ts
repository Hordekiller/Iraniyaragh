import { describe, expect, it, vi } from "vitest";
import { SmsIrProvider, toSmsIrMobile } from "./sms-ir.provider";

const request = {
  purpose: "customer_login" as const,
  destination: "+989121234567",
  templateId: 123456,
  parameters: { Code: "654321" },
  correlationId: "req-1",
};
const response = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("SmsIrProvider", () => {
  it("normalizes the canonical destination and accepts only a proven message id", async () => {
    const fetcher = vi.fn(async () =>
      response(200, { status: 1, data: { messageId: 42, cost: 1.5 } }),
    );
    const result = await new SmsIrProvider(
      { apiKey: "secret", timeoutMs: 100 },
      fetcher,
    ).send(request);
    expect(result).toEqual({ status: "accepted", providerMessageId: "42" });
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({
      mobile: "9121234567",
      templateId: 123456,
      parameters: [{ name: "Code", value: "654321" }],
    });
  });

  it.each([
    [429, 0],
    [200, 20],
  ])(
    "maps rate limiting from HTTP/vendor status",
    async (httpStatus, vendorStatus) => {
      const result = await new SmsIrProvider(
        { apiKey: "secret", timeoutMs: 100 },
        async () => response(httpStatus, { status: vendorStatus }),
      ).send(request);
      expect(result).toEqual({ status: "rate_limited" });
    },
  );

  it.each([
    [10, "authentication"],
    [14, "account"],
    [101, "sender"],
    [102, "credit"],
    [104, "destination"],
    [114, "content"],
    [113, "template"],
    [109, "invalid_request"],
    [999, "unknown"],
  ])(
    "maps vendor status %s without leaking its response",
    async (vendorStatus, reason) => {
      const result = await new SmsIrProvider(
        { apiKey: "secret", timeoutMs: 100 },
        async () =>
          response(400, { status: vendorStatus, message: "raw vendor text" }),
      ).send(request);
      expect(result).toEqual({ status: "rejected", reason });
      expect(JSON.stringify(result)).not.toContain("raw vendor text");
    },
  );

  it("maps vendor status 0 to unavailable", async () => {
    expect(
      await new SmsIrProvider({ apiKey: "secret", timeoutMs: 100 }, async () =>
        response(200, { status: 0 }),
      ).send(request),
    ).toEqual({ status: "unavailable" });
  });

  it("never accepts a success-shaped envelope on non-success HTTP", async () => {
    expect(
      await new SmsIrProvider({ apiKey: "secret", timeoutMs: 100 }, async () =>
        response(400, { status: 1, data: { messageId: 42 } }),
      ).send(request),
    ).toEqual({ status: "rejected", reason: "unknown" });
  });

  it.each([
    [401, "authentication"],
    [400, "invalid_request"],
  ])("maps a non-JSON HTTP %s response safely", async (status, reason) => {
    const plain = new Response("not-json", { status });
    expect(
      await new SmsIrProvider(
        { apiKey: "secret", timeoutMs: 100 },
        async () => plain,
      ).send(request),
    ).toEqual({ status: "rejected", reason });
  });

  it.each([
    [500, { status: 0 }],
    [503, null],
  ])("maps HTTP %s to unavailable", async (status, body) => {
    expect(
      await new SmsIrProvider({ apiKey: "secret", timeoutMs: 100 }, async () =>
        response(status, body),
      ).send(request),
    ).toEqual({ status: "unavailable" });
  });

  it("maps malformed or unprovable success responses to unknown_result", async () => {
    const malformed = new Response("{", { status: 200 });
    expect(
      await new SmsIrProvider(
        { apiKey: "secret", timeoutMs: 100 },
        async () => malformed,
      ).send(request),
    ).toEqual({ status: "unknown_result" });
    expect(
      await new SmsIrProvider({ apiKey: "secret", timeoutMs: 100 }, async () =>
        response(200, { status: 1, data: {} }),
      ).send(request),
    ).toEqual({ status: "unknown_result" });
  });

  it("maps a timeout after dispatch to unknown_result and never retries", async () => {
    const fetcher = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) =>
          init.signal?.addEventListener("abort", () =>
            reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
          ),
        ),
    );
    expect(
      await new SmsIrProvider({ apiKey: "secret", timeoutMs: 1 }, fetcher).send(
        request,
      ),
    ).toEqual({ status: "unknown_result" });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("maps pre-response transport failure to unavailable", async () => {
    expect(
      await new SmsIrProvider(
        { apiKey: "secret", timeoutMs: 100 },
        async () => {
          throw new Error("network");
        },
      ).send(request),
    ).toEqual({ status: "unavailable" });
  });
});

describe("toSmsIrMobile", () => {
  it("accepts only the canonical project format", () => {
    expect(toSmsIrMobile("+989121234567")).toBe("9121234567");
    expect(() => toSmsIrMobile("09121234567")).toThrow();
  });
});
