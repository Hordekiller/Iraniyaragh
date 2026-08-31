import { describe, expect, it } from 'vitest';
import { REDACTED, redact, safeErrorMessage } from './redaction';

describe('redact', () => {
  it('redacts values under sensitive keys', () => {
    expect(redact({ password: 'hunter2', name: 'Ali' })).toEqual({
      password: REDACTED,
      name: 'Ali',
    });
  });

  it('redacts authorization headers entirely', () => {
    expect(redact({ authorization: 'Bearer abc.def.ghi' })).toEqual({
      authorization: REDACTED,
    });
  });

  it('scrubs long secret-looking and PII values inside strings', () => {
    const result = redact({
      message: 'token eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9 contact 09123456789 email ali@example.com',
    }) as { message: string };

    expect(result.message).not.toContain('eyJhbGciOiJIUzI1Ni');
    expect(result.message).not.toContain('09123456789');
    expect(result.message).not.toContain('ali@example.com');
  });

  it('handles nested objects and arrays', () => {
    expect(
      redact({ user: { details: { apiKey: 'a'.repeat(24) }, name: 'Ali' }, roles: ['admin'] }),
    ).toEqual({ user: { details: { apiKey: REDACTED }, name: 'Ali' }, roles: ['admin'] });
  });

  it('breaks circular references without throwing', () => {
    const node: Record<string, unknown> = { name: 'Ali' };
    node.self = node;
    const result = redact(node);

    expect(result).not.toBe(node);
    expect(JSON.stringify(result)).toContain('CIRCULAR');
  });

  it('caps recursion at a bounded depth', () => {
    const deep = { a: { a: { a: { a: { a: { a: { a: { a: { a: { leaf: 'x' } } } } } } } } } };
    const result = redact(deep) as Record<string, unknown>;
    expect(JSON.stringify(result)).toContain('DEPTH_LIMIT');
  });

  it('returns null for null/undefined input', () => {
    expect(redact(null)).toBeNull();
    expect(redact(undefined)).toBeNull();
  });
});

describe('safeErrorMessage', () => {
  it('scrubs secrets from error messages', () => {
    const outcome = safeErrorMessage(new Error('connection refused token abcdefghijklmnopqrstuvwxyz123456'));
    expect(outcome).not.toContain('abcdefghijklmnopqrstuvwxyz123456');
  });

  it('returns a generic message for non-object, non-string errors', () => {
    expect(safeErrorMessage(42)).toBe('Unexpected error');
  });

  it('scrubs a plain message string in place', () => {
    expect(safeErrorMessage('boom token abcdefghijklmnopqrstuvwxyz123456'))
      .not.toContain('abcdefghijklmnopqrstuvwxyz123456');
  });
});
