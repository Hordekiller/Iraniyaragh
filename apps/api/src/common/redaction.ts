const SENSITIVE_KEY_PATTERN =
  /(password|passwd|secret|token|authorization|credential|api[-_]?key|otp|client[-_]?secret|refresh[-_]?token|private[-_]?key|pin|jwt|bearer)/i;

const SECRET_VALUE_PATTERN =
  /\b(?:[A-Za-z0-9+/]{24,}={0,2}|[A-Za-z0-9_-]{24,})\b/g;

// Deliberately broad to cover JWT, OTP codes, phone numbers and private keys.
const PII_PATTERN =
  /\b(?:\d{10,15}|09\d{9}|\+?\d{8,15}|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})\b/gi;

export const REDACTED = '[REDACTED]';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function redactKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERN.test(key);
}

function scrubString(value: string): string {
  return value.replace(SECRET_VALUE_PATTERN, REDACTED).replace(PII_PATTERN, REDACTED);
}

function walkNode(node: unknown, depth: number, seen: Set<unknown>): unknown {
  if (depth > 8) return '[DEPTH_LIMIT]';
  if (typeof node === 'string') return scrubString(node);
  if (typeof node === 'number' || typeof node === 'boolean' || node === null || node === undefined) {
    return node;
  }

  if (Array.isArray(node)) {
    if (seen.has(node)) return '[CIRCULAR]';
    seen.add(node);
    const result = node.map(item => walkNode(item, depth + 1, seen));
    seen.delete(node);
    return result;
  }

  if (isObject(node)) {
    if (seen.has(node)) return '[CIRCULAR]';
    seen.add(node);
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node)) {
      if (redactKey(key)) {
        result[key] = key.toLowerCase().includes('authorization')
          ? '[REDACTED]'
          : REDACTED;
      } else {
        result[key] = walkNode(value, depth + 1, seen);
      }
    }
    seen.delete(node);
    return result;
  }

  return REDACTED;
}

/**
 * Recursively redacts sensitive values and keys (secrets, OTP, tokens, PII)
 * from arbitrary data that will be logged or included in outward-facing
 * responses. Handles nested objects, arrays, cycles and depth limits.
 */
export function redact(value: unknown): unknown {
  return walkNode(value ?? null, 0, new Set());
}

/**
 * Returns a stable, non-leaking summary message for an unexpected error.
 * The original error name/stack are never surfaced to the caller. If the
 * input is already a plain message string it is scrubbed in place.
 */
export function safeErrorMessage(error: unknown): string {
  if (typeof error === 'string') return scrubString(error);
  const message = typeof error === 'object' && error !== null && 'message' in error
    ? String((error as { message: unknown }).message)
    : 'Unexpected error';
  return scrubString(message);
}
