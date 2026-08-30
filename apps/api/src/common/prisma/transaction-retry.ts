import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

/**
 * FOUNDATION gap #5: critical serializable transactions need bounded retry
 * behaviour for serialization/deadlock conflicts (SQLSTATE 40001 / 40P01).
 *
 * Wraps a serializable transaction with a bounded number of retries and a small
 * jittered backoff, re-running the whole work function when a conflict is
 * detected. This preserves the invariant "critical inventory/financial
 * mutations happen inside serializable transactions" while making conflicts
 * recoverable instead of failing the request.
 */
export interface TransactionRetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

export async function withSerializableRetry<T>(
  prisma: PrismaService,
  work: (tx: Prisma.TransactionClient) => Promise<T>,
  options: TransactionRetryOptions = {},
): Promise<T> {
  const maxRetries = options.maxRetries ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 25;
  const maxDelayMs = options.maxDelayMs ?? 200;

  let attempt = 0;
  for (;;) {
    try {
      return await prisma.$transaction(work, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      const metaError =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        typeof (error.meta as { error?: unknown } | undefined)?.error === 'string'
          ? (error.meta as { error: string }).error
          : undefined;
      const isConflict =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === 'P2034' || error.code === 'P2002' || (metaError ?? '').includes('serialization'));
      const isSerialization = isConflict || isSerializationError(error);
      if (!isSerialization || attempt >= maxRetries) {
        throw error;
      }
      attempt += 1;
      await sleep(jitter(baseDelayMs, maxDelayMs, attempt));
    }
  }
}

function isSerializationError(error: unknown): boolean {
  // Raw driver errors can surface as Error with a code/sqlState property.
  const e = error as { code?: string; sqlState?: string; message?: string } | null;
  if (!e) return false;
  const code = e.code ?? e.sqlState;
  if (code === '40001' || code === '40P01') return true;
  return typeof e.message === 'string' && /serializ|deadlock/i.test(e.message);
}

function jitter(baseDelayMs: number, maxDelayMs: number, attempt: number): number {
  const cap = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
  return Math.floor(Math.random() * cap) + 1;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
