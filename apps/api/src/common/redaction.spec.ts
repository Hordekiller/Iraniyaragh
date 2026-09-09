import { describe, expect, it } from "vitest";
import { REDACTED, TRUNCATED, redact, safeErrorMessage } from "./redaction";

describe("redact", () => {
  it("redacts values under sensitive keys", () => {
    expect(redact({ password: "hunter2", name: "Ali" })).toEqual({
      password: REDACTED,
      name: "Ali",
    });
  });

  it("redacts authorization headers entirely", () => {
    expect(redact({ authorization: "Bearer abc.def.ghi" })).toEqual({
      authorization: REDACTED,
    });
  });

  it("scrubs long secret-looking and PII values inside strings", () => {
    const result = redact({
      message:
        "token eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9 contact 09123456789 email ali@example.com",
    }) as { message: string };

    expect(result.message).not.toContain("eyJhbGciOiJIUzI1Ni");
    expect(result.message).not.toContain("09123456789");
    expect(result.message).not.toContain("ali@example.com");
  });

  it("handles nested objects and arrays", () => {
    expect(
      redact({
        user: { details: { apiKey: "a".repeat(24) }, name: "Ali" },
        roles: ["admin"],
      }),
    ).toEqual({
      user: { details: { apiKey: REDACTED }, name: "Ali" },
      roles: ["admin"],
    });
  });

  it("breaks circular references without throwing", () => {
    const node: Record<string, unknown> = { name: "Ali" };
    node.self = node;
    const result = redact(node);

    expect(result).not.toBe(node);
    expect(JSON.stringify(result)).toContain("CIRCULAR");
  });

  it("caps recursion at a bounded depth", () => {
    const deep = {
      a: { a: { a: { a: { a: { a: { a: { a: { a: { leaf: "x" } } } } } } } } },
    };
    const result = redact(deep) as Record<string, unknown>;
    expect(JSON.stringify(result)).toContain("DEPTH_LIMIT");
  });

  it("returns null for null/undefined input", () => {
    expect(redact(null)).toBeNull();
    expect(redact(undefined)).toBeNull();
  });

  it("drops raw headers, query and body containers and strips URL query/hash", () => {
    expect(
      redact({
        headers: { accept: "*/*", cookie: "session=secret" },
        query: { mobile: "09123456789" },
        body: { password: "secret" },
        requestUrl: "https://shop.example/products/1?token=secret#account",
      }),
    ).toEqual({
      headers: REDACTED,
      query: REDACTED,
      body: REDACTED,
      requestUrl: "https://shop.example/products/1",
    });
  });

  it("bounds strings, arrays and object cardinality", () => {
    const result = redact({
      text: "x".repeat(3_000),
      items: Array.from({ length: 100 }, (_, index) => index),
      wide: Object.fromEntries(
        Array.from({ length: 100 }, (_, index) => [`key${index}`, index]),
      ),
    }) as { text: string; items: unknown[]; wide: Record<string, unknown> };

    expect(result.text).toContain(TRUNCATED);
    expect(result.items).toHaveLength(65);
    expect(result.items.at(-1)).toBe(TRUNCATED);
    expect(result.wide._truncated).toBe(TRUNCATED);
    expect(Object.keys(result.wide)).toHaveLength(65);
  });

  it("does not execute getters and serializes Error causes without stacks", () => {
    let getterCalled = false;
    const hostile = Object.defineProperty({}, "secretValue", {
      enumerable: true,
      get() {
        getterCalled = true;
        throw new Error("must not execute");
      },
    });
    const error = new Error("provider failed", {
      cause: new Error("for user@example.com"),
    });
    const result = redact({ hostile, error });

    expect(getterCalled).toBe(false);
    expect(JSON.stringify(result)).not.toContain("user@example.com");
    expect(JSON.stringify(result)).not.toContain("stack");
  });

  it("converts BigInt and invalid Date values into JSON-safe values", () => {
    expect(() =>
      JSON.stringify(redact({ count: 42n, when: new Date("invalid") })),
    ).not.toThrow();
    expect(redact({ count: 42n, when: new Date("invalid") })).toEqual({
      count: "42",
      when: REDACTED,
    });
  });
});

describe("safeErrorMessage", () => {
  it("scrubs secrets from error messages", () => {
    const outcome = safeErrorMessage(
      new Error("connection refused token abcdefghijklmnopqrstuvwxyz123456"),
    );
    expect(outcome).not.toContain("abcdefghijklmnopqrstuvwxyz123456");
  });

  it("returns a generic message for non-object, non-string errors", () => {
    expect(safeErrorMessage(42)).toBe("Unexpected error");
  });

  it("scrubs a plain message string in place", () => {
    expect(
      safeErrorMessage("boom token abcdefghijklmnopqrstuvwxyz123456"),
    ).not.toContain("abcdefghijklmnopqrstuvwxyz123456");
  });
});
