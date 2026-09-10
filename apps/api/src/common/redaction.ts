const SENSITIVE_KEY_PATTERN =
  /(password|passwd|secret|token|authorization|credential|api[-_]?key|otp|client[-_]?secret|refresh[-_]?token|private[-_]?key|pin|jwt|bearer|cookie|set[-_]?cookie)/i;
const BLOCKED_CONTAINER_PATTERN =
  /^(?:headers?|query|body|request|response|raw)$/i;
const URL_KEY_PATTERN = /(?:url|uri)$/i;
const SECRET_VALUE_PATTERN =
  /\b(?:[A-Za-z0-9+/]{24,}={0,2}|[A-Za-z0-9_-]{24,})\b/g;
const PII_PATTERN =
  /\b(?:\d{10,15}|09\d{9}|\+?\d{8,15}|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})\b/gi;

const MAX_DEPTH = 8;
const MAX_OBJECT_KEYS = 64;
const MAX_ARRAY_ITEMS = 64;
const MAX_STRING_LENGTH = 2_048;

export const REDACTED = "[REDACTED]";
export const TRUNCATED = "[TRUNCATED]";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function scrubString(value: string): string {
  const bounded =
    value.length > MAX_STRING_LENGTH
      ? `${value.slice(0, MAX_STRING_LENGTH)}${TRUNCATED}`
      : value;
  return bounded
    .replace(SECRET_VALUE_PATTERN, REDACTED)
    .replace(PII_PATTERN, REDACTED);
}

function scrubUrl(value: unknown): unknown {
  if (typeof value !== "string") return REDACTED;
  try {
    const parsed = new URL(value, "http://redaction.invalid");
    parsed.search = "";
    parsed.hash = "";
    return scrubString(
      parsed.origin === "http://redaction.invalid"
        ? parsed.pathname
        : parsed.toString(),
    );
  } catch {
    return REDACTED;
  }
}

function readOwnEntries(
  node: Record<string, unknown>,
): Array<[string, unknown]> {
  const keys = Object.keys(node);
  const entries: Array<[string, unknown]> = [];
  for (const key of keys.slice(0, MAX_OBJECT_KEYS)) {
    const descriptor = Object.getOwnPropertyDescriptor(node, key);
    entries.push([
      key,
      descriptor && "value" in descriptor ? descriptor.value : REDACTED,
    ]);
  }
  if (keys.length > MAX_OBJECT_KEYS) entries.push(["_truncated", TRUNCATED]);
  return entries;
}

function walkNode(node: unknown, depth: number, seen: Set<unknown>): unknown {
  if (depth > MAX_DEPTH) return "[DEPTH_LIMIT]";
  if (typeof node === "string") return scrubString(node);
  if (
    typeof node === "number" ||
    typeof node === "boolean" ||
    node === null ||
    node === undefined
  )
    return node;
  if (typeof node === "bigint") return node.toString();
  if (typeof node === "symbol" || typeof node === "function") return REDACTED;
  if (node instanceof Date)
    return Number.isNaN(node.valueOf()) ? REDACTED : node.toISOString();
  if (node instanceof Error) {
    return {
      name: scrubString(node.name),
      message: safeErrorMessage(node),
      ...(node.cause === undefined
        ? {}
        : { cause: walkNode(node.cause, depth + 1, seen) }),
    };
  }

  if (Array.isArray(node)) {
    if (seen.has(node)) return "[CIRCULAR]";
    seen.add(node);
    const result = node
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item) => walkNode(item, depth + 1, seen));
    if (node.length > MAX_ARRAY_ITEMS) result.push(TRUNCATED);
    seen.delete(node);
    return result;
  }

  if (isObject(node)) {
    if (seen.has(node)) return "[CIRCULAR]";
    seen.add(node);
    const result: Record<string, unknown> = {};
    for (const [key, value] of readOwnEntries(node)) {
      if (
        SENSITIVE_KEY_PATTERN.test(key) ||
        BLOCKED_CONTAINER_PATTERN.test(key)
      )
        result[key] = REDACTED;
      else if (URL_KEY_PATTERN.test(key)) result[key] = scrubUrl(value);
      else result[key] = walkNode(value, depth + 1, seen);
    }
    seen.delete(node);
    return result;
  }
  return REDACTED;
}

/** Recursively converts arbitrary values into bounded, JSON-safe diagnostic data. */
export function redact(value: unknown): unknown {
  try {
    return walkNode(value ?? null, 0, new Set());
  } catch {
    return REDACTED;
  }
}

/** Returns a bounded non-leaking error message; stacks are handled by the logger policy. */
export function safeErrorMessage(error: unknown): string {
  try {
    if (typeof error === "string") return scrubString(error);
    const message =
      typeof error === "object" && error !== null && "message" in error
        ? String((error as { message: unknown }).message)
        : "Unexpected error";
    return scrubString(message);
  } catch {
    return "Unexpected error";
  }
}
