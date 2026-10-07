import { ConflictException } from "@nestjs/common";
import { Prisma } from "@prisma/client";

export const SERIALIZABLE_RETRIES = 3;

/** Raw SQL surfaces PostgreSQL transaction aborts as P2010, not always P2034. */
export function isPrismaTransactionConflict(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  return error.code === 'P2034' || (error.code === 'P2010' &&
    (error.meta?.code === '40001' || error.meta?.code === '40P01'));
}

export function isPrismaSerializableContention(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2034" || error.code === "P2002")
  );
}

export async function withSerializableRetry<T>(options: {
  operation: () => Promise<T>;
  isContention: (error: unknown) => boolean;
  conflictMessage: string;
  /**
   * Milliseconds to wait before the next attempt. Contended writers on the same
   * rows make an immediate retry collide with the winner again, so a caller that
   * serializes a hot row (for example one staff member signing in on two devices)
   * asks for a short backoff. Defaults to none, which keeps the behaviour of
   * every existing caller unchanged.
   */
  backoffMs?: number;
  /**
   * Total attempts. Defaults to SERIALIZABLE_RETRIES; a caller that serializes a
   * single very hot row can ask for more, because each retry is cheap compared
   * with a spurious 409 shown to the person signing in.
   */
  attempts?: number;
}): Promise<T> {
  const { operation, isContention, conflictMessage, backoffMs = 0, attempts = SERIALIZABLE_RETRIES } = options;
  const maxAttempts = Math.max(1, attempts);
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      const retryable =
        isContention(error) || isPrismaSerializableContention(error);
      if (!retryable || attempt === maxAttempts) {
        if (retryable) {
          throw new ConflictException({
            code: "CONFLICT",
            message: conflictMessage,
          });
        }
        throw error;
      }
      if (backoffMs > 0) {
        await new Promise((resolve) => {
          setTimeout(resolve, backoffMs * attempt);
        });
      }
    }
  }
  throw new Error("Unreachable serializable retry state.");
}
