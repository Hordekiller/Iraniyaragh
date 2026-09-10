import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RedactedLogger } from "./redacted-logger";
import { runWithRequestContext } from "./request-context";

const requestId = "logger-req-1";

function captureWrite(target: "stdout" | "stderr") {
  const write = vi
    .spyOn(process[target], "write")
    .mockImplementation(() => true);
  return write;
}

describe("RedactedLogger", () => {
  let stdout: ReturnType<typeof captureWrite>;
  let stderr: ReturnType<typeof captureWrite>;
  let logger: RedactedLogger;

  beforeEach(() => {
    stdout = captureWrite("stdout");
    stderr = captureWrite("stderr");
    logger = new RedactedLogger();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("emits structured JSON with level, message and request id", () => {
    runWithRequestContext(
      { requestId, correlationId: requestId, startedAt: "x" },
      () => logger.log("hello world"),
    );

    const line = stdout.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(line) as Record<string, unknown>;
    expect(parsed.level).toBe("info");
    expect(parsed.severity).toBe("info");
    expect(parsed.service).toBe("iranyaragh-api");
    expect(parsed.environment).toBeTruthy();
    expect(parsed.version).toBeTruthy();
    expect(parsed.event).toBe("application.log");
    expect(parsed.message).toBe("hello world");
    expect(parsed.requestId).toBe(requestId);
    expect(parsed.timestamp).toBeTruthy();
  });

  it("emits the bounded diagnostic event contract with trace correlation", () => {
    runWithRequestContext(
      {
        requestId,
        correlationId: "correlation-1",
        startedAt: "x",
        traceId: "trace-1",
        spanId: "span-1",
      },
      () =>
        logger.event("warn", {
          event: "provider.sms.completed",
          outcome: "unknown",
          durationMs: 125,
          errorCode: "UPSTREAM_UNAVAILABLE",
          businessRef: "notification:42",
          data: { authorization: "Bearer secret" },
        }),
    );

    const parsed = JSON.parse(stdout.mock.calls[0]?.[0] as string) as Record<
      string,
      unknown
    >;
    expect(parsed).toMatchObject({
      severity: "warn",
      event: "provider.sms.completed",
      outcome: "unknown",
      durationMs: 125,
      errorCode: "UPSTREAM_UNAVAILABLE",
      businessRef: "notification:42",
      requestId,
      correlationId: "correlation-1",
      traceId: "trace-1",
      spanId: "span-1",
    });
    expect(JSON.stringify(parsed)).not.toContain("Bearer secret");
  });

  it("falls back to a no-request-id marker outside a request context", () => {
    logger.log("no context");
    const parsed = JSON.parse(stdout.mock.calls[0]?.[0] as string) as Record<
      string,
      unknown
    >;
    expect(parsed.requestId).toBe("no-request-id");
  });

  it("redacts sensitive payload keys", () => {
    runWithRequestContext(
      { requestId, correlationId: requestId, startedAt: "x" },
      () =>
        logger.log("event", { apiKey: "abcdef0123456789", user: { id: 7 } }),
    );

    const line = stdout.mock.calls[0]?.[0] as string;
    expect(JSON.stringify(line)).toContain("[REDACTED]");
    expect(line).not.toContain("abcdef0123456789");
  });

  it("redacts sensitive values embedded in Error messages", () => {
    runWithRequestContext(
      { requestId, correlationId: requestId, startedAt: "x" },
      () =>
        logger.error(
          new Error(
            "refresh token abcdefghijklmnopqrstuvwxyz012345 was rejected for user@example.com",
          ),
        ),
    );

    const line = stderr.mock.calls[0]?.[0] as string;
    expect(line).toContain("[REDACTED]");
    expect(line).not.toContain("abcdefghijklmnopqrstuvwxyz012345");
    expect(line).not.toContain("user@example.com");
  });

  it("routes fatal and error levels to stderr", () => {
    runWithRequestContext(
      { requestId, correlationId: requestId, startedAt: "x" },
      () => logger.error("something failed"),
    );
    runWithRequestContext(
      { requestId, correlationId: requestId, startedAt: "x" },
      () => logger.fatal("fatal problem"),
    );

    expect(stdout).not.toHaveBeenCalled();
    expect(stderr).toHaveBeenCalledTimes(2);
  });

  it("never emits production stack traces", () => {
    logger = new RedactedLogger({ environment: "production" });
    logger.error(new Error("safe failure"));
    const parsed = JSON.parse(stderr.mock.calls[0]?.[0] as string) as Record<
      string,
      unknown
    >;
    expect(parsed.stack).toBeUndefined();
  });

  it("keeps development stacks redacted", () => {
    logger = new RedactedLogger({ environment: "development" });
    const error = new Error("failed for user@example.com");
    error.stack = "Error: failed for user@example.com at /srv/app.ts:1";
    logger.error(error);
    const line = stderr.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(line) as Record<string, unknown>;
    expect(parsed.stack).toBeTruthy();
    expect(line).not.toContain("user@example.com");
  });

  it("does not throw when stdout or serialization input is hostile", () => {
    stdout.mockImplementation(() => {
      throw new Error("broken pipe");
    });
    const hostile = Object.defineProperty({}, "value", {
      enumerable: true,
      get() {
        throw new Error("getter");
      },
    });
    expect(() =>
      logger.log("business operation completed", hostile),
    ).not.toThrow();
  });
});
