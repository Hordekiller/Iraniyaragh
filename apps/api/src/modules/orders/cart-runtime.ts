import {
  BadRequestException,
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { createHash, randomInt } from 'node:crypto';
import {
  CART_EXPIRED_CLEANUP_BATCH,
  CART_RETRY_BASE_DELAY_MS,
  CART_SERIALIZABLE_RETRIES,
  MAX_CART_QUANTITY,
} from './cart.constants';

const IDEMPOTENCY_KEY_MAX_LENGTH = 128;

export function normalizeCartMutationKey(value: string): string {
  const normalized = value.trim();
  if (
    normalized.length === 0 ||
    normalized.length > IDEMPOTENCY_KEY_MAX_LENGTH ||
    hasControlCharacter(normalized)
  ) {
    throw new BadRequestException({
      code: 'INVALID_REQUEST',
      message: 'A valid Idempotency-Key of at most 128 characters is required.',
    });
  }
  return normalized;
}

export function normalizeCartServiceVariantId(value: string): string {
  const normalized = value.trim();
  if (
    normalized.length === 0 ||
    normalized.length > 191 ||
    hasControlCharacter(normalized)
  ) {
    throw new BadRequestException({
      code: 'INVALID_REQUEST',
      message: 'A valid variantId is required.',
    });
  }
  return normalized;
}

export function validateCartQuantity(quantity: number): void {
  if (
    !Number.isInteger(quantity) ||
    quantity < 1 ||
    quantity > MAX_CART_QUANTITY
  ) {
    throw new UnprocessableEntityException({
      code: 'CART_QUANTITY_INVALID',
      message: 'Quantity must be between 1 and 99.',
    });
  }
}

export function cartLineLimitExceeded(): ConflictException {
  return new ConflictException({
    code: 'CART_LINE_LIMIT_EXCEEDED',
    message: 'Cart line limit exceeded.',
  });
}

export function hashCartValue(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export async function cleanupCustomerCartMutations(
  tx: Prisma.TransactionClient,
  customerId: string,
  now: Date,
): Promise<void> {
  const expired = await tx.cartMutation.findMany({
    where: { customerId, expiresAt: { lte: now } },
    orderBy: [{ expiresAt: 'asc' }, { id: 'asc' }],
    select: { id: true },
    take: CART_EXPIRED_CLEANUP_BATCH,
  });
  if (expired.length > 0) {
    await tx.cartMutation.deleteMany({
      where: { id: { in: expired.map(({ id }) => id) } },
    });
  }
}

export async function runCartSerializable<T>(
  operation: () => Promise<T>,
): Promise<T> {
  for (
    let attempt = 1;
    attempt <= CART_SERIALIZABLE_RETRIES;
    attempt += 1
  ) {
    try {
      return await operation();
    } catch (error) {
      if (!isRetryableContention(error)) throw error;
      if (attempt === CART_SERIALIZABLE_RETRIES) {
        throw new ConflictException({
          code: 'CONFLICT',
          message:
            'Cart changed concurrently; retry with the same idempotency key.',
        });
      }
      await waitForRetry(attempt);
    }
  }
  throw new Error('Unreachable Cart retry state.');
}

function hasControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint < 32 || codePoint === 127;
  });
}

function isRetryableContention(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    ((error as { code?: unknown }).code === 'P2034' ||
      (error as { code?: unknown }).code === 'P2002')
  );
}

async function waitForRetry(attempt: number): Promise<void> {
  const exponential = CART_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
  const delayMs = Math.min(
    100,
    exponential + randomInt(CART_RETRY_BASE_DELAY_MS + 1),
  );
  await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
}
