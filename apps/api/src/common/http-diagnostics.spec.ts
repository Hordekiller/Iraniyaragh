import { EventEmitter } from "node:events";
import type { Request, Response } from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ValidationPipe } from "@nestjs/common";
import {
  diagnosticException,
  diagnosticId,
  diagnosticReference,
} from "@iranyaragh/contracts";
import { observeHttpRequest } from "./http-diagnostics";
import { runWithRequestContext } from "./request-context";
import { diagnosticValidationFactory } from "./validation-diagnostics";
import { observeWorker } from "./worker-diagnostics";
import { redact } from "./redaction";

afterEach(() => vi.restoreAllMocks());
function harness(
  method = "POST",
  status = 422,
  route = "/api/v1/catalog/admin/products/:id",
) {
  const request = {
    method,
    route: { path: route },
    originalUrl: "/customer@example.com?token=private",
    body: { password: "private" },
  } as unknown as Request;
  const response = Object.assign(new EventEmitter(), {
    statusCode: status,
    writableFinished: true,
    locals: { diagnosticFailure: { errorCode: "INVALID_REQUEST" } },
  }) as unknown as Response;
  const lines: string[] = [];
  vi.spyOn(process.stdout, "write").mockImplementation((line) => {
    lines.push(String(line));
    return true;
  });
  vi.spyOn(process.stderr, "write").mockImplementation((line) => {
    lines.push(String(line));
    return true;
  });
  runWithRequestContext(
    {
      requestId: "diagnostic-request",
      correlationId: "diagnostic-request",
      startedAt: "",
    },
    () => observeHttpRequest(request, response),
  );
  return { response, lines };
}
describe("HTTP and worker diagnostic privacy", () => {
  it("retains context through completion and logs once without private request data", () => {
    const { response, lines } = harness();
    response.emit("finish");
    response.emit("close");
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toMatchObject({
      requestId: "diagnostic-request",
      outcome: "failure",
      route: "/api/v1/catalog/admin/products/:id",
      data: { statusCode: 422, errorCode: "INVALID_REQUEST" },
    });
    expect(lines[0]).not.toMatch(/customer@example|private/u);
  });
  it("marks an interrupted mutation outcome as unknown", () => {
    const { response, lines } = harness("POST", 200);
    Object.assign(response, { writableFinished: false });
    response.emit("close");
    expect(JSON.parse(lines[0])).toMatchObject({
      event: "http.request.aborted",
      outcome: "unknown",
      data: { statusCode: 499 },
    });
  });
  it("keeps healthy reads quiet and records successful writes", () => {
    const first = harness("GET", 200, "/api/v1/catalog/products");
    first.response.emit("finish");
    expect(first.lines).toEqual([]);
    const second = harness("PATCH", 200);
    second.response.emit("finish");
    expect(JSON.parse(second.lines[0])).toMatchObject({
      outcome: "success",
      level: "info",
    });
  });
  it("records fast Admin reads and labels product writes without logging values", () => {
    const read = harness("GET", 200, "/api/v1/catalog/admin/products");
    read.response.emit("finish");
    expect(JSON.parse(read.lines[0])).toMatchObject({
      data: {
        surface: "admin",
        area: "catalog",
        operation: "catalog.product.list",
        statusCode: 200,
      },
    });
    const write = harness(
      "PATCH",
      409,
      "/api/v1/catalog/admin/products/:id/description",
    );
    write.response.emit("finish");
    expect(JSON.parse(write.lines[0])).toMatchObject({
      data: {
        operation: "catalog.product.description.save",
        statusCode: 409,
      },
    });
    expect(write.lines[0]).not.toMatch(/private|customer@example/u);
  });
  it("records slow reads and excludes unknown method/path input", () => {
    vi.spyOn(performance, "now")
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(2500);
    const first = harness("GET", 200);
    first.response.emit("finish");
    expect(JSON.parse(first.lines[0])).toMatchObject({
      level: "warn",
      durationMs: 2500,
    });
    const other = harness("private-method", 500, "/مشتری");
    other.response.emit("finish");
    expect(JSON.parse(other.lines[0])).toMatchObject({
      level: "error",
      route: "unmatched",
      data: { method: "OTHER" },
    });
  });
  it("retains safe source coordinates and codes without exception values", () => {
    const error = Object.assign(new TypeError("password=private"), {
      code: "ECONNREFUSED",
    });
    error.stack =
      "TypeError: private\n at fn (/app/dist/src/catalog.service.js:12:4)\n at fn (/home/customer@example.com:1:2)";
    expect(diagnosticException(error)).toEqual({
      errorType: "TypeError",
      causeCode: "ECONNREFUSED",
      frames: ["dist/src/catalog.service.js:12:4"],
    });
    expect(diagnosticException("private")).toEqual({
      errorType: "Error",
      frames: [],
    });
    expect(
      diagnosticException(
        Object.assign(new Error(), { code: "SECRET", name: "private" }),
      ),
    ).toEqual({ errorType: "Error", frames: [] });
  });
  it("preserves known codes while hiding URL credentials and short secrets", () => {
    expect(
      redact({
        errorCode: "AUTH_REAUTHENTICATION_REQUIRED",
        url: "https://user:private@example.com/file?token=private",
        message:
          "password=private Bearer private https://user:private@example.com/path?token=private",
      }),
    ).toEqual({
      errorCode: "AUTH_REAUTHENTICATION_REQUIRED",
      url: "https://example.com/file",
      message: "password=[REDACTED] [REDACTED] https://example.com/path",
    });
  });
  it("preserves the public validation contract while logging rules without values or unknown property names", () => {
    const errors = [
      {
        property: "variants",
        children: [
          {
            property: "0",
            children: [
              {
                property: "salePrice",
                value: "private",
                constraints: { isNumber: "salePrice must be a number" },
              },
            ],
          },
        ],
      },
      {
        property: "customer@example.com",
        constraints: { whitelistValidation: "property should not exist" },
      },
    ];
    const result = diagnosticValidationFactory()(errors);
    expect(result.getResponse()).toEqual(
      new ValidationPipe().createExceptionFactory()(errors).getResponse(),
    );
    expect(result.diagnosticValidation).toEqual([
      { field: "variants.0.salePrice", rules: ["isNumber"] },
      { field: "[unknown-field]", rules: ["whitelistValidation"] },
    ]);
    const many = diagnosticValidationFactory()(
      Array.from({ length: 50 }, (_, i) => ({
        property: `field${i}`,
        constraints: { isString: "private" },
      })),
    );
    expect(many.diagnosticValidation).toHaveLength(16);
  });
  it("logs queue connection and retry exhaustion without job data", () => {
    const emitter = new EventEmitter();
    const lines: string[] = [];
    vi.spyOn(process.stderr, "write").mockImplementation((line) => {
      lines.push(String(line));
      return true;
    });
    observeWorker(
      emitter as Parameters<typeof observeWorker>[0],
      "product-media-processing",
    );
    emitter.emit("error", new Error("redis://user:private@host"));
    emitter.emit(
      "failed",
      {
        id: "synthetic-job",
        attemptsMade: 3,
        opts: { attempts: 3 },
        data: { phone: "09123456789" },
      },
      new Error("private"),
    );
    emitter.emit("failed", undefined, new Error("private"));
    expect(JSON.parse(lines[1])).toMatchObject({
      data: {
        attempt: 3,
        exhausted: true,
        jobRef: expect.stringMatching(/^[a-f0-9]{16}$/u),
      },
    });
    expect(lines.join("")).not.toMatch(/private|09123456789|synthetic-job/u);
  });
  it("validates and bounds support references", () => {
    expect(diagnosticId("invalid id")).toBeUndefined();
    expect(diagnosticId(" x-1 ")).toBe("x-1");
    expect(diagnosticReference({ requestId: "x-1" })).toBe("کد پیگیری: x-1");
    expect(diagnosticReference(null)).toBe("");
  });
});
