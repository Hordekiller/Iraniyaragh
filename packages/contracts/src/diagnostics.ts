/** Correlation identifiers are opaque diagnostic references, never authorization. */
export function diagnosticId(value: unknown): string | undefined {
  return typeof value === 'string' && /^[A-Za-z0-9._:-]{1,128}$/u.test(value.trim())
    ? value.trim()
    : undefined;
}

export function createDiagnosticId(): string {
  return globalThis.crypto.randomUUID();
}

export function logClientFailure(
  service: 'admin' | 'storefront',
  requestId: string,
  kind: 'network' | 'timeout' | 'parse' | 'http',
  statusCode?: number,
): void {
  try {
    console.warn(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        service: `iranyaragh-${service}`,
        level: kind === 'http' && (statusCode ?? 500) < 500 ? 'warn' : 'error',
        event: 'client.request.failed',
        requestId: diagnosticId(requestId),
        kind,
        statusCode,
      }),
    );
  } catch {
    /* Diagnostics never fail a request. */
  }
}

export function diagnosticReference(error: unknown): string {
  const id =
    error && typeof error === 'object'
      ? diagnosticId(Object.getOwnPropertyDescriptor(error, 'requestId')?.value)
      : undefined;
  return id ? `کد پیگیری: ${id}` : '';
}

/** No exception messages/SQL, source excerpts, full paths or user input. */
export function diagnosticException(error: unknown): {
  errorType: string;
  causeCode?: string;
  frames: string[];
} {
  try {
    const knownNames = new Set([
      'Error',
      'TypeError',
      'SyntaxError',
      'RangeError',
      'AbortError',
      'TimeoutError',
      'PrismaClientKnownRequestError',
      'PrismaClientInitializationError',
      'PrismaClientValidationError',
    ]);
    const name = error instanceof Error ? error.name : '';
    const code =
      error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
        ? error.code
        : '';
    const frames =
      error instanceof Error
        ? (error.stack ?? '')
            .slice(0, 16_000)
            .split('\n')
            .slice(1, 16)
            .flatMap((line) => {
              const match =
                /(?:^|[/(])((?:dist\/src|src|\.next\/server)\/[A-Za-z0-9_./-]{1,180}\.[cm]?js:\d{1,7}:\d{1,6})\)?$/u.exec(
                  line.trim(),
                );
              return match ? [match[1]] : [];
            })
            .slice(0, 8)
        : [];
    return {
      errorType: knownNames.has(name) ? name : 'Error',
      ...(/^(?:P\d{4}|E(?:CONNRESET|CONNREFUSED|TIMEDOUT|PIPE|NOTFOUND|AI_AGAIN)|UND_ERR_[A-Z_]{1,40})$/u.test(
        code,
      )
        ? { causeCode: code }
        : {}),
      frames,
    };
  } catch {
    return { errorType: 'Error', frames: [] };
  }
}

/** A framework hook supplies a registered route template, never a request URL. */
export function logRenderFailure(
  service: 'iranyaragh-admin' | 'iranyaragh-storefront',
  version: string | undefined,
  requestId: unknown,
  routePath: string,
  error: unknown,
): void {
  try {
    const route = /^\/[A-Za-z0-9_/.[\]()-]{0,240}$/u.test(routePath) ? routePath : 'unknown';
    console.error(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'error',
        service,
        version: version ?? 'unknown',
        event: 'render.request.failed',
        requestId: diagnosticId(requestId),
        route,
        ...diagnosticException(error),
      }),
    );
  } catch {
    /* Error reporting must not replace the original response. */
  }
}
