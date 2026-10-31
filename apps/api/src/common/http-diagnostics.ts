import type { Request, Response } from "express";
import { adminDiagnosticOperation } from "@iranyaragh/contracts";
import { RedactedLogger } from "./redacted-logger";
import { getRequestContext, runWithRequestContext } from "./request-context";

const METHODS = new Set([
  "GET",
  "HEAD",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
]);
export function diagnosticRoute(request: Request): string {
  const path: unknown = request.route?.path;
  // Express route templates only. Never use originalUrl/path/params/query.
  return typeof path === "string" &&
    /^\/[A-Za-z0-9_/:.*{}()-]{0,240}$/u.test(path)
    ? path
    : "unmatched";
}

export function observeHttpRequest(request: Request, response: Response): void {
  const started = performance.now();
  const logger = new RedactedLogger();
  const context = getRequestContext();
  let done = false;
  const complete = (aborted: boolean) => {
    if (done) return;
    done = true;
    const durationMs = Math.round(performance.now() - started);
    const statusCode = aborted ? 499 : response.statusCode;
    const method = METHODS.has(request.method) ? request.method : "OTHER";
    const route = diagnosticRoute(request);
    const operation = adminDiagnosticOperation(method, route);
    // Admin reads are observable too; quick public successes remain quiet.
    if (
      !operation &&
      statusCode < 400 &&
      ["GET", "HEAD", "OPTIONS"].includes(method) &&
      durationMs < 2_000
    )
      return;
    logger.event(
      statusCode >= 500
        ? "error"
        : statusCode >= 400 || durationMs >= 2_000
          ? "warn"
          : "info",
      {
        event: aborted ? "http.request.aborted" : "http.request.completed",
        route,
        outcome: aborted
          ? "unknown"
          : statusCode >= 400
            ? "failure"
            : "success",
        durationMs,
        data: {
          method,
          statusCode,
          ...operation,
          ...(response.locals.diagnosticFailure ?? {}),
        },
      },
    );
  };
  const finish = (aborted: boolean) =>
    context
      ? runWithRequestContext(context, () => complete(aborted))
      : complete(aborted);
  response.once("finish", () => finish(false));
  response.once("close", () => finish(!response.writableFinished));
}
