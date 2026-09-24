import { describe, expect, it, vi } from "vitest";
import { ZarinpalProvider } from "./zarinpal.provider";

const config = {
  merchantId: "11111111-2222-3333-4444-555555555555",
  mode: "sandbox" as const,
  timeoutMs: 100,
  callbackUrl: "http://localhost:4321/api/v1/payments/zarinpal/callback",
};

const request = {
  orderId: "ord_123",
  orderNumber: "ORD-20260924-001",
  amountMinorUnits: "250000",
  currency: "IRR" as const,
  callbackUrl: "http://localhost:4321/api/v1/payments/zarinpal/callback",
  correlationId: "req-1",
};

const response = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("ZarinpalProvider", () => {
  it("rejects invalid configuration before any request can be sent", () => {
    const fetcher = vi.fn();
    expect(() => new ZarinpalProvider({ ...config, merchantId: "" }, fetcher)).toThrow();
    expect(
      () => new ZarinpalProvider({ ...config, merchantId: "sec ret" }, fetcher),
    ).toThrow();
    expect(() => new ZarinpalProvider({ ...config, timeoutMs: 100 }, fetcher)).not.toThrow();
    expect(() => new ZarinpalProvider({ ...config, timeoutMs: 0 }, fetcher)).toThrow();
    expect(() => new ZarinpalProvider({ ...config, timeoutMs: -1 }, fetcher)).toThrow();
    expect(
      () => new ZarinpalProvider({ ...config, callbackUrl: "relative/path" }, fetcher),
    ).toThrow();
    expect(
      () =>
        new ZarinpalProvider(
          { ...config, mode: "live", callbackUrl: "http://localhost/cb" },
          fetcher,
        ),
    ).toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    [{ amountMinorUnits: "" }, "invalid_request"],
    [{ amountMinorUnits: "12.5" }, "invalid_request"],
    [{ amountMinorUnits: "-10" }, "invalid_request"],
    [{ orderId: "" }, "invalid_request"],
    [{ orderNumber: "" }, "invalid_request"],
    [{ correlationId: "" }, "invalid_request"],
    [{ correlationId: "x".repeat(129) }, "invalid_request"],
  ])(
    "rejects invalid outbound input without network I/O",
    async (change, reason) => {
      const fetcher = vi.fn();
      const result = await new ZarinpalProvider(config, fetcher).authorize({
        ...request,
        ...change,
      });
      expect(result).toEqual({ status: "rejected", reason });
      expect(fetcher).not.toHaveBeenCalled();
    },
  );

  it("sends a server-composed payload and accepts only a proven authority", async () => {
    const fetcher = vi.fn(async () =>
      response(200, { data: { code: 100, message: "OK", authority: "A000000000000000000000000001234567" } }),
    );
    const result = await new ZarinpalProvider(config, fetcher).authorize(request);
    expect(result).toEqual({
      status: "redirect",
      authority: "A000000000000000000000000001234567",
      redirectUrl: "https://sandbox.zarinpal.com/pg/StartPay/A000000000000000000000000001234567",
    });
    expect(String(fetcher.mock.calls[0]?.[0])).toBe(
      "https://sandbox.zarinpal.com/pg/v4/payment/request.json",
    );
    const sent = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)) as Record<string, unknown>;
    expect(sent).toEqual({
      merchant_id: config.merchantId,
      amount: "250000",
      currency: "IRR",
      description: "Iraniyaragh order ORD-20260924-001",
      callback_url: config.callbackUrl,
      metadata: { order_id: "ord_123" },
    });
  });

  it("builds the live request and redirect URLs when configured live", async () => {
    const liveConfig = {
      ...config,
      mode: "live" as const,
      callbackUrl: "https://pay.example.com/cb",
    };
    const fetcher = vi.fn(async () =>
      response(200, { status: 100, authority: "LIVE00000000000000000000000000123" }),
    );
    const result = await new ZarinpalProvider(liveConfig, fetcher).authorize(request);
    expect(result).toEqual({
      status: "redirect",
      authority: "LIVE00000000000000000000000000123",
      redirectUrl: "https://payment.zarinpal.com/pg/StartPay/LIVE00000000000000000000000000123",
    });
    expect(String(fetcher.mock.calls[0]?.[0])).toBe(
      "https://payment.zarinpal.com/pg/v4/payment/request.json",
    );
  });

  it("accepts a realistic sandbox success with an S-prefixed authority", async () => {
    const fetcher = vi.fn(async () =>
      response(200, {
        data: {
          code: 100,
          message: "Success",
          authority: "S00000000000000000000000000000wwOGYpd",
          fee_type: "Merchant",
          fee: 100,
        },
        errors: [],
      }),
    );
    const result = await new ZarinpalProvider(config, fetcher).authorize(request);
    expect(result).toEqual({
      status: "redirect",
      authority: "S00000000000000000000000000000wwOGYpd",
      redirectUrl: "https://sandbox.zarinpal.com/pg/StartPay/S00000000000000000000000000000wwOGYpd",
    });
  });

  it.each([
    [101, "authentication"],
    [102, "amount"],
    [42, "invalid_request"],
    [99, "invalid_request"],
    [103, "unknown"],
    [104, "unknown"],
    [999, "unknown"],
  ])(
    "maps gateway code %s to a rejection reason",
    async (code, reason) => {
      const result = await new ZarinpalProvider(
        config,
        async () => response(200, { data: { code, message: "raw vendor text" } }),
      ).authorize(request);
      expect(result).toEqual({ status: "rejected", reason });
      expect(JSON.stringify(result)).not.toContain("raw vendor text");
    },
  );

  it("never accepts a success-shaped envelope on non-success HTTP", async () => {
    expect(
      await new ZarinpalProvider(
        config,
        async () => response(400, { data: { code: 100, authority: "X" } }),
      ).authorize(request),
    ).toEqual({ status: "rejected", reason: "invalid_request" });
  });

  it.each([
    [401, "authentication"],
    [400, "invalid_request"],
    [404, "invalid_request"],
  ])("maps a non-JSON HTTP %s response safely", async (status, reason) => {
    const plain = new Response("not-json", { status });
    expect(
      await new ZarinpalProvider(config, async () => plain).authorize(request),
    ).toEqual({ status: "rejected", reason });
  });

  it.each([[500, null], [502, { data: {} }], [503, { errors: [] }]])(
    "maps HTTP %s to unavailable",
    async (status, body) => {
      expect(
        await new ZarinpalProvider(config, async () => response(status, body)).authorize(
          request,
        ),
      ).toEqual({ status: "unavailable" });
    },
  );

  it("maps malformed or unprovable success responses to unknown_result", async () => {
    const malformed = new Response("{", { status: 200 });
    expect(
      await new ZarinpalProvider(config, async () => malformed).authorize(request),
    ).toEqual({ status: "unknown_result" });
    expect(
      await new ZarinpalProvider(config, async () => response(200, { data: {} })).authorize(
        request,
      ),
    ).toEqual({ status: "unknown_result" });
    expect(
      await new ZarinpalProvider(config, async () => response(200, { data: { code: 100 } })).authorize(
        request,
      ),
    ).toEqual({ status: "unknown_result" });
  });

  it("rejects an oversized provider response without parsing it", async () => {
    const oversized = new Response("x".repeat(32 * 1024 + 1), { status: 200 });
    expect(
      await new ZarinpalProvider(config, async () => oversized).authorize(request),
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
      await new ZarinpalProvider({ ...config, timeoutMs: 1 }, fetcher).authorize(request),
    ).toEqual({ status: "unknown_result" });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("maps pre-response transport failure to unavailable", async () => {
    expect(
      await new ZarinpalProvider(config, async () => {
        throw new Error("network");
      }).authorize(request),
    ).toEqual({ status: "unavailable" });
  });
});