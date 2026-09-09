import { Injectable, type LoggerService, LogLevel } from "@nestjs/common";
import { getRequestContext, getRequestId } from "./request-context";
import { redact, safeErrorMessage } from "./redaction";

type LogPayload = Record<string, unknown> | string | Error | unknown;
type DiagnosticOutcome = "success" | "failure" | "unknown";

export type DiagnosticEvent = {
  event: string;
  outcome?: DiagnosticOutcome;
  durationMs?: number;
  errorCode?: string;
  actorRef?: string;
  entityRef?: string;
  businessRef?: string;
  data?: Record<string, unknown>;
};

export type RedactedLoggerOptions = {
  service?: string;
  environment?: string;
  version?: string;
  includeStack?: boolean;
};

@Injectable()
export class RedactedLogger implements LoggerService {
  readonly levels: LogLevel[] = [
    "log",
    "error",
    "warn",
    "debug",
    "verbose",
    "fatal",
  ];
  private readonly options: Required<RedactedLoggerOptions>;

  constructor(options: RedactedLoggerOptions = {}) {
    const environment =
      options.environment ?? process.env.NODE_ENV ?? "development";
    this.options = {
      service: options.service ?? "iranyaragh-api",
      environment,
      version: options.version ?? process.env.APP_VERSION ?? "unknown",
      includeStack: options.includeStack ?? environment !== "production",
    };
  }

  event(level: "info" | "warn" | "error", event: DiagnosticEvent): void {
    this.write(level, event.event, event.data, event);
  }

  private format(
    level: string,
    message: string,
    payload?: LogPayload,
    event?: DiagnosticEvent,
  ): string {
    const context = getRequestContext();
    const requestId = getRequestId();
    const entry: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      level,
      severity: level,
      service: this.options.service,
      environment: this.options.environment,
      version: this.options.version,
      event: event?.event ?? "application.log",
      message: safeErrorMessage(message),
      requestId,
      correlationId: context?.correlationId ?? requestId,
      ...(context?.traceId ? { traceId: context.traceId } : {}),
      ...(context?.spanId ? { spanId: context.spanId } : {}),
    };

    if (event) {
      Object.assign(
        entry,
        redact({
          outcome: event.outcome,
          durationMs: event.durationMs,
          errorCode: event.errorCode,
          actorRef: event.actorRef,
          entityRef: event.entityRef,
          businessRef: event.businessRef,
        }),
      );
    }

    if (payload !== undefined) {
      if (payload instanceof Error) {
        entry.message = safeErrorMessage(payload);
        entry.error = redact(payload);
        if (this.options.includeStack && payload.stack)
          entry.stack = redact(payload.stack);
      } else {
        entry.data = redact(payload);
      }
    }
    return JSON.stringify(entry);
  }

  private write(
    level: string,
    message: string,
    payload?: LogPayload,
    event?: DiagnosticEvent,
  ): void {
    try {
      const line = this.format(level, message, payload, event);
      const destination =
        level === "error" || level === "fatal"
          ? process.stderr
          : process.stdout;
      destination.write(`${line}\n`);
    } catch {
      // Diagnostic logging is best-effort and must never fail a business operation.
    }
  }

  log(message: string | object, ...optionalParams: unknown[]): void {
    this.write(
      "info",
      this.template(message),
      this.payload(message, optionalParams),
    );
  }
  error(message: string | object, ...optionalParams: unknown[]): void {
    this.write(
      "error",
      this.template(message),
      this.payload(message, optionalParams),
    );
  }
  warn(message: string | object, ...optionalParams: unknown[]): void {
    this.write(
      "warn",
      this.template(message),
      this.payload(message, optionalParams),
    );
  }
  debug(message: string | object, ...optionalParams: unknown[]): void {
    this.write(
      "debug",
      this.template(message),
      this.payload(message, optionalParams),
    );
  }
  verbose(message: string | object, ...optionalParams: unknown[]): void {
    this.write(
      "verbose",
      this.template(message),
      this.payload(message, optionalParams),
    );
  }
  fatal(message: string | object, ...optionalParams: unknown[]): void {
    this.write(
      "fatal",
      this.template(message),
      this.payload(message, optionalParams),
    );
  }

  private template(message: string | object): string {
    return typeof message === "string" ? message : "structured log entry";
  }

  private payload(
    message: string | object,
    optionalParams: unknown[],
  ): LogPayload | undefined {
    if (message instanceof Error) return message;
    if (typeof message === "object" && message !== null) {
      return {
        ...this.safeOwnData(message),
        ...this.objectFromParams(optionalParams),
      };
    }
    const objects = this.objectFromParams(optionalParams);
    return Object.keys(objects).length > 0 ? objects : undefined;
  }

  private objectFromParams(params: unknown[]): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const param of params) {
      if (
        typeof param === "object" &&
        param !== null &&
        !(param instanceof Error)
      ) {
        Object.assign(result, this.safeOwnData(param));
      }
    }
    return result;
  }

  private safeOwnData(value: object): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value).slice(0, 64)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      result[key] =
        descriptor && "value" in descriptor ? descriptor.value : "[REDACTED]";
    }
    return result;
  }
}
