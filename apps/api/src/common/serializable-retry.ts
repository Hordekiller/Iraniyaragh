import { ConflictException } from "@nestjs/common";
import { Prisma } from "@prisma/client";

export const SERIALIZABLE_RETRIES = 3;

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
}): Promise<T> {
  const { operation, isContention, conflictMessage } = options;
  for (let attempt = 1; attempt <= SERIALIZABLE_RETRIES; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      const retryable =
        isContention(error) || isPrismaSerializableContention(error);
      if (!retryable || attempt === SERIALIZABLE_RETRIES) {
        if (retryable) {
          throw new ConflictException({
            code: "CONFLICT",
            message: conflictMessage,
          });
        }
        throw error;
      }
    }
  }
  throw new Error("Unreachable serializable retry state.");
}
