import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RedactedLogger } from './redacted-logger';
import { runWithRequestContext } from './request-context';

const requestId = 'logger-req-1';

function captureWrite(target: 'stdout' | 'stderr') {
  const write = vi.spyOn(process[target], 'write').mockImplementation(() => true);
  return write;
}

describe('RedactedLogger', () => {
  let stdout: ReturnType<typeof captureWrite>;
  let stderr: ReturnType<typeof captureWrite>;
  let logger: RedactedLogger;

  beforeEach(() => {
    stdout = captureWrite('stdout');
    stderr = captureWrite('stderr');
    logger = new RedactedLogger();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('emits structured JSON with level, message and request id', () => {
    runWithRequestContext(
      { requestId, correlationId: requestId, startedAt: 'x' },
      () => logger.log('hello world'),
    );

    const line = stdout.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(line) as Record<string, unknown>;
    expect(parsed.level).toBe('info');
    expect(parsed.message).toBe('hello world');
    expect(parsed.requestId).toBe(requestId);
    expect(parsed.timestamp).toBeTruthy();
  });

  it('falls back to a no-request-id marker outside a request context', () => {
    logger.log('no context');
    const parsed = JSON.parse(stdout.mock.calls[0]?.[0] as string) as Record<string, unknown>;
    expect(parsed.requestId).toBe('no-request-id');
  });

  it('redacts sensitive payload keys', () => {
    runWithRequestContext(
      { requestId, correlationId: requestId, startedAt: 'x' },
      () => logger.log('event', { apiKey: 'abcdef0123456789', user: { id: 7 } }),
    );

    const line = stdout.mock.calls[0]?.[0] as string;
    expect(JSON.stringify(line)).toContain('[REDACTED]');
    expect(line).not.toContain('abcdef0123456789');
  });

  it('routes fatal and error levels to stderr', () => {
    runWithRequestContext(
      { requestId, correlationId: requestId, startedAt: 'x' },
      () => logger.error('something failed'),
    );
    runWithRequestContext(
      { requestId, correlationId: requestId, startedAt: 'x' },
      () => logger.fatal('fatal problem'),
    );

    expect(stdout).not.toHaveBeenCalled();
    expect(stderr).toHaveBeenCalledTimes(2);
  });
});
