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
  it("rejects invalid configuration before any request can be sent", () => {
    const fetcher = vi.fn();
    expect(
      () => new SmsIrProvider({ apiKey: "", timeoutMs: 100 }, fetcher),
    ).toThrow();
    expect(
      () => new SmsIrProvider({ apiKey: " secret ", timeoutMs: 100 }, fetcher),
    ).toThrow();
    expect(
      () => new SmsIrProvider({ apiKey: "secret", timeoutMs: 0 }, fetcher),
    ).toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each(["unit key", "unit\nkey", "unit\u0000key", "unit\u007fkey"])(
    "rejects invalid key characters without exposing the value",
    (apiKey) => {
      const fetcher = vi.fn();
      expect(
        () => new SmsIrProvider({ apiKey, timeoutMs: 100 }, fetcher),
      ).toThrow("SMS.ir provider configuration is invalid.");
      expect(fetcher).not.toHaveBeenCalled();
    },
  );

  it.each([
    [{ destination: "09121234567" }, "destination"],
    [{ templateId: 0 }, "invalid_request"],
    [{ correlationId: "" }, "invalid_request"],
    [{ parameters: {} }, "invalid_request"],
    [{ parameters: { "bad name": "123456" } }, "invalid_request"],
    [{ parameters: { Code: "x".repeat(26) } }, "invalid_request"],
  ])(
    "rejects invalid outbound input without network I/O",
    async (change, reason) => {
      const fetcher = vi.fn();
      const result = await new SmsIrProvider(
        { apiKey: "secret", timeoutMs: 100 },
        fetcher,
      ).send({ ...request, ...change });
      expect(result).toEqual({ status: "rejected", reason });
      expect(fetcher).not.toHaveBeenCalled();
    },
  );

  it("normalizes the canonical destination and accepts only a proven message id", async () => {
    const fetcher = vi.fn(async () =>
      response(200, { status: 1, data: { messageId: 42, cost: 1.5 } }),
    );
    const result = await new SmsIrProvider(
      { apiKey: "secret", timeoutMs: 100 },
      fetcher,
    ).send(request);
    expect(result).toEqual({ status: "accepted", providerMessageId: "42" });
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ redirect: "error" });
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
    [11, "authentication"],
    [12, "authentication"],
    [13, "account"],
    [14, "account"],
    [101, "sender"],
    [102, "credit"],
    [104, "destination"],
    [115, "destination"],
    [114, "content"],
    [113, "template"],
    [119, "template"],
    [109, "invalid_request"],
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

  it("keeps vendor internal errors ambiguous", async () => {
    expect(
      await new SmsIrProvider({ apiKey: "secret", timeoutMs: 100 }, async () =>
        response(200, { status: 0 }),
      ).send(request),
    ).toEqual({ status: "unknown_result" });
  });

  it("does not classify an undocumented vendor code as a definite rejection", async () => {
    expect(
      await new SmsIrProvider(
        { apiKey: "unit-test-key", timeoutMs: 100 },
        async () => response(200, { status: 999 }),
      ).send(request),
    ).toEqual({ status: "unknown_result" });
  });

  it("never accepts a success-shaped envelope on non-success HTTP", async () => {
    expect(
      await new SmsIrProvider({ apiKey: "secret", timeoutMs: 100 }, async () =>
        response(400, { status: 1, data: { messageId: 42 } }),
      ).send(request),
    ).toEqual({ status: "unknown_result" });
  });

  it.each([
    [401, "authentication"],
    [403, "authentication"],
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
  ])("keeps HTTP %s ambiguous", async (status, body) => {
    expect(
      await new SmsIrProvider({ apiKey: "secret", timeoutMs: 100 }, async () =>
        response(status, body),
      ).send(request),
    ).toEqual({ status: "unknown_result" });
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

  it("rejects an oversized provider response without parsing it", async () => {
    const oversized = new Response("x".repeat(32 * 1024 + 1), { status: 200 });
    expect(
      await new SmsIrProvider(
        { apiKey: "secret", timeoutMs: 100 },
        async () => oversized,
      ).send(request),
    ).toEqual({ status: "unknown_result" });
  });

  it.each([null, [], "text", 42, true])(
    "keeps non-object JSON ambiguous (%j)",
    async (body) => {
      expect(
        await new SmsIrProvider(
          { apiKey: "unit-test-key", timeoutMs: 100 },
          async () => response(200, body),
        ).send(request),
      ).toEqual({ status: "unknown_result" });
    },
  );

  it.each([
    0,
    -1,
    1.5,
    Number.MAX_SAFE_INTEGER + 1,
    "0",
    "-1",
    "x",
    "1".repeat(129),
    null,
  ])("never accepts an invalid message id (%j)", async (messageId) => {
    expect(
      await new SmsIrProvider(
        { apiKey: "unit-test-key", timeoutMs: 100 },
        async () => response(200, { status: 1, data: { messageId } }),
      ).send(request),
    ).toEqual({ status: "unknown_result" });
  });

  it("accepts a positive decimal-string id without converting its precision", async () => {
    expect(
      await new SmsIrProvider(
        { apiKey: "unit-test-key", timeoutMs: 100 },
        async () =>
          response(200, { status: 1, data: { messageId: "9007199254740993" } }),
      ).send(request),
    ).toEqual({ status: "accepted", providerMessageId: "9007199254740993" });
  });

  it("cancels a declared oversized response before reading its stream", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({ cancel });
    expect(
      await new SmsIrProvider(
        { apiKey: "unit-test-key", timeoutMs: 100 },
        async () =>
          new Response(body, { headers: { "content-length": "32769" } }),
      ).send(request),
    ).toEqual({ status: "unknown_result" });
    expect(cancel).toHaveBeenCalledOnce();
    expect(body.locked).toBe(false);
  });

  it("keeps interrupted response streams ambiguous without logging sensitive exceptions", async () => {
    const log = vi.spyOn(console, "error");
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(new Error("private-body"));
      },
    });
    const fetcher = vi.fn(async () => new Response(body));
    expect(
      await new SmsIrProvider(
        { apiKey: "unit-test-key", timeoutMs: 100 },
        fetcher,
      ).send(request),
    ).toEqual({ status: "unknown_result" });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(log).not.toHaveBeenCalled();
    expect(body.locked).toBe(false);
  });

  it.each([429, 500, 503])(
    "cancels HTTP %s response bodies",
    async (status) => {
      const cancel = vi.fn();
      const body = new ReadableStream<Uint8Array>({ cancel });
      await new SmsIrProvider(
        { apiKey: "unit-test-key", timeoutMs: 100 },
        async () => new Response(body, { status }),
      ).send(request);
      expect(cancel).toHaveBeenCalledOnce();
    },
  );

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

  it("keeps network failure ambiguous", async () => {
    expect(
      await new SmsIrProvider(
        { apiKey: "secret", timeoutMs: 100 },
        async () => {
          throw new Error("network");
        },
      ).send(request),
    ).toEqual({ status: "unknown_result" });
  });
});

describe("toSmsIrMobile", () => {
  it("accepts only the canonical project format", () => {
    expect(toSmsIrMobile("+989121234567")).toBe("9121234567");
    expect(() => toSmsIrMobile("09121234567")).toThrow();
  });
});

describe("SmsIrProvider account health", () => {
  it("checks authentication without dispatching or projecting account credit", async () => {
    const fetcher = vi.fn(async () => response(200, { status: 1, data: 100 }));
    const result = await new SmsIrProvider(
      { apiKey: "unit-test-key", timeoutMs: 100 },
      fetcher,
    ).checkHealth();
    expect(result).toMatchObject({
      checked: true,
      providerHealth: "ok",
      errorClass: null,
    });
    expect(fetcher).toHaveBeenCalledWith(
      "https://api.sms.ir/v1/credit",
      expect.objectContaining({ method: "GET", redirect: "error" }),
    );
    expect(Object.keys(result).sort()).toEqual([
      "checked",
      "errorClass",
      "lastCheckedAt",
      "providerHealth",
    ]);
  });
  it.each([
    [200, { status: 1, data: 0 }, "degraded", "provider_error"],
    [401, null, "down", "auth"],
    [403, null, "down", "auth"],
    [429, null, "degraded", "rate_limit"],
    [503, null, "down", "provider_error"],
    [200, { status: 11 }, "down", "auth"],
    [200, { status: 1, data: "100" }, "unknown", "provider_error"],
    [200, null, "unknown", "provider_error"],
  ] as const)(
    "sanitizes account health (%s/%j)",
    async (status, body, providerHealth, errorClass) => {
      expect(
        await new SmsIrProvider(
          { apiKey: "unit-test-key", timeoutMs: 100 },
          async () => response(status, body),
        ).checkHealth(),
      ).toMatchObject({ checked: true, providerHealth, errorClass });
    },
  );
  it("bounds health timeouts without retry", async () => {
    const fetcher = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) =>
          init.signal?.addEventListener("abort", () =>
            reject(new Error("private-network-error")),
          ),
        ),
    );
    expect(
      await new SmsIrProvider(
        { apiKey: "unit-test-key", timeoutMs: 1 },
        fetcher,
      ).checkHealth(),
    ).toMatchObject({ providerHealth: "down", errorClass: "timeout" });
    expect(fetcher).toHaveBeenCalledOnce();
  });
});
