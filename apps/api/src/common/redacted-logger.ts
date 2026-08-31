import { Injectable, type LoggerService, LogLevel } from '@nestjs/common';
import { getRequestId } from './request-context';
import { redact } from './redaction';

type LogPayload = Record<string, unknown> | string | Error | unknown;

@Injectable()
export class RedactedLogger implements LoggerService {
  readonly levels: LogLevel[] = ['log', 'error', 'warn', 'debug', 'verbose', 'fatal'];

  private format(level: string, message: string, payload?: LogPayload): string {
    const entry: Record<string, unknown> = {
      level,
      message,
      timestamp: new Date().toISOString(),
      requestId: getRequestId(),
    };

    if (payload !== undefined) {
      if (payload instanceof Error) {
        entry.message = payload.message;
        if (payload.stack) entry.stack = redact(payload.stack);
      } else if (typeof payload === 'string') {
        entry.payload = redact(payload);
      } else {
        entry.payload = redact(payload);
      }
    }

    return JSON.stringify(entry);
  }

  private write(level: string, message: string, payload?: LogPayload): void {
    const line = this.format(level, message, payload);
    if (level === 'error' || level === 'fatal') {
      process.stderr.write(line + '\n');
    } else {
      process.stdout.write(line + '\n');
    }
  }

  log(message: string | object, ...optionalParams: unknown[]): void {
    this.write('info', this.template(message), this.payload(message, optionalParams));
  }

  error(message: string | object, ...optionalParams: unknown[]): void {
    this.write('error', this.template(message), this.payload(message, optionalParams));
  }

  warn(message: string | object, ...optionalParams: unknown[]): void {
    this.write('warn', this.template(message), this.payload(message, optionalParams));
  }

  debug(message: string | object, ...optionalParams: unknown[]): void {
    this.write('debug', this.template(message), this.payload(message, optionalParams));
  }

  verbose(message: string | object, ...optionalParams: unknown[]): void {
    this.write('verbose', this.template(message), this.payload(message, optionalParams));
  }

  fatal(message: string | object, ...optionalParams: unknown[]): void {
    this.write('fatal', this.template(message), this.payload(message, optionalParams));
  }

  private template(message: string | object): string {
    return typeof message === 'string' ? message : 'structured log entry';
  }

  private payload(message: string | object, optionalParams: unknown[]): LogPayload | undefined {
    if (typeof message === 'object' && message !== null) {
      return { ...this.asRecord(message), ...this.objectFromParams(optionalParams) };
    }
    const objects = this.objectFromParams(optionalParams);
    return Object.keys(objects).length > 0 ? objects : undefined;
  }

  private objectFromParams(params: unknown[]): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const param of params) {
      if (typeof param === 'object' && param !== null && !(param instanceof Error)) {
        Object.assign(result, this.asRecord(param));
      }
    }
    return result;
  }

  private asRecord(value: object): Record<string, unknown> {
    return value as Record<string, unknown>;
  }
}
