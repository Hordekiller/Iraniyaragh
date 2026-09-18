import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomInt } from 'node:crypto';
import type { CartResponse } from '@iranyaragh/contracts';
import { PrismaService } from '../../database/prisma.service';
import { buildCartView, buildEmptyCartView, cartInclude } from './cart-view';

const MAX_LINES = 100;
const MAX_QUANTITY = 99;
const IDEMPOTENCY_KEY_MAX_LENGTH = 128;
const MUTATION_TTL_MS = 24 * 60 * 60 * 1000;
const EXPIRED_CLEANUP_BATCH = 100;
const SERIALIZABLE_RETRIES = 5;
const RETRY_BASE_DELAY_MS = 5;

const CART_SCOPES = {
  add: 'cart.add:/api/v1/cart/lines',
  set: 'cart.set:/api/v1/cart/lines/:variantId',
  remove: 'cart.remove:/api/v1/cart/lines/:variantId',
} as const;

type CartMutationResult = {
  cartId: string | null;
  response: CartResponse;
};

@Injectable()
export class CartService {
  constructor(private readonly prisma: PrismaService) {}

  async getForUser(userId: string): Promise<CartResponse> {
    const customer = await this.customer(userId);
    const cart = await this.prisma.cart.findUnique({
      where: { customerId: customer.id },
      include: cartInclude(),
    });

    return {
      data: { cart: cart ? buildCartView(cart) : buildEmptyCartView() },
    };
  }

  async addForUser(
    userId: string,
    input: { variantId: string; quantity: number },
    key: string,
  ): Promise<CartResponse> {
    const variantId = normalizeVariantId(input.variantId);
    validateQuantity(input.quantity);
    const idempotencyKey = normalizeIdempotencyKey(key);
    const customer = await this.customer(userId);

    return this.runMutation(
      customer.id,
      CART_SCOPES.add,
      idempotencyKey,
      { variantId, quantity: input.quantity },
      (tx) =>
        this.writeLine(tx, customer.id, variantId, (currentQuantity) =>
          currentQuantity === null
            ? input.quantity
            : currentQuantity + input.quantity,
        ),
    );
  }

  async removeForUser(
    userId: string,
    variantIdInput: string,
    key: string,
  ): Promise<CartResponse> {
    const variantId = normalizeVariantId(variantIdInput);
    const idempotencyKey = normalizeIdempotencyKey(key);
    const customer = await this.customer(userId);

    return this.runMutation(
      customer.id,
      CART_SCOPES.remove,
      idempotencyKey,
      { variantId },
      async (tx, now) => {
        const cart = await tx.cart.findUnique({
          where: { customerId: customer.id },
        });
        if (!cart) {
          return {
            cartId: null,
            response: { data: { cart: buildEmptyCartView(now) } },
          };
        }

        const deleted = await tx.cartItem.deleteMany({
          where: { cartId: cart.id, variantId },
        });
        if (deleted.count > 0) {
          await tx.cart.update({
            where: { id: cart.id },
            data: { version: { increment: 1 } },
          });
        }

        return this.persistedCartResult(tx, cart.id, now);
      },
    );
  }

  async setForUser(
    userId: string,
    variantIdInput: string,
    quantity: number,
    key: string,
  ): Promise<CartResponse> {
    const variantId = normalizeVariantId(variantIdInput);
    validateQuantity(quantity);
    const idempotencyKey = normalizeIdempotencyKey(key);
    const customer = await this.customer(userId);

    return this.runMutation(
      customer.id,
      CART_SCOPES.set,
      idempotencyKey,
      { variantId, quantity },
      (tx) => this.writeLine(tx, customer.id, variantId, () => quantity),
    );
  }

  private async writeLine(
    tx: Prisma.TransactionClient,
    customerId: string,
    variantId: string,
    resolveQuantity: (currentQuantity: number | null) => number,
  ): Promise<CartMutationResult> {
    await this.requireSellableVariant(tx, variantId);
    const cart = await tx.cart.upsert({
      where: { customerId },
      create: { customerId },
      update: {},
    });
    const line = await tx.cartItem.findUnique({
      where: { cartId_variantId: { cartId: cart.id, variantId } },
    });
    if (
      !line &&
      (await tx.cartItem.count({ where: { cartId: cart.id } })) >= MAX_LINES
    ) {
      throw lineLimitExceeded();
    }

    const quantity = resolveQuantity(line?.quantity ?? null);
    validateQuantity(quantity);
    if (line?.quantity === quantity) {
      return this.persistedCartResult(tx, cart.id);
    }

    await tx.cartItem.upsert({
      where: { cartId_variantId: { cartId: cart.id, variantId } },
      create: { cartId: cart.id, variantId, quantity },
      update: { quantity },
    });
    await tx.cart.update({
      where: { id: cart.id },
      data: { version: { increment: 1 } },
    });

    return this.persistedCartResult(tx, cart.id);
  }

  private async runMutation(
    customerId: string,
    scope: (typeof CART_SCOPES)[keyof typeof CART_SCOPES],
    idempotencyKey: string,
    payload: Record<string, unknown>,
    operation: (
      tx: Prisma.TransactionClient,
      now: Date,
    ) => Promise<CartMutationResult>,
  ): Promise<CartResponse> {
    const keyHash = hash(idempotencyKey);
    const fingerprint = hash(JSON.stringify({ scope, payload }));

    return this.withSerializableRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          const now = new Date();
          await this.cleanupExpiredMutations(tx, customerId, now);
          const prior = await this.findReplay(
            tx,
            customerId,
            scope,
            keyHash,
            idempotencyKey,
            now,
          );
          if (prior) {
            const legacyFingerprint = hash(JSON.stringify(payload));
            const fingerprintMatches =
              prior.fingerprint === fingerprint ||
              (prior.idempotencyKey !== null &&
                prior.fingerprint === legacyFingerprint);
            if (!fingerprintMatches) {
              throw new ConflictException({
                code: 'IDEMPOTENCY_CONFLICT',
                message: 'Idempotency key payload conflict.',
              });
            }
            return prior.responseJson as unknown as CartResponse;
          }

          const result = await operation(tx, now);
          await tx.cartMutation.create({
            data: {
              cartId: result.cartId,
              customerId,
              scope,
              idempotencyKey: null,
              keyHash,
              fingerprint,
              responseJson: result.response as unknown as Prisma.InputJsonValue,
              expiresAt: new Date(now.getTime() + MUTATION_TTL_MS),
            },
          });
          return result.response;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
  }

  private async findReplay(
    tx: Prisma.TransactionClient,
    customerId: string,
    scope: string,
    keyHash: string,
    legacyKey: string,
    now: Date,
  ) {
    const scoped = await tx.cartMutation.findUnique({
      where: {
        customerId_scope_keyHash: { customerId, scope, keyHash },
      },
    });
    if (scoped && scoped.expiresAt > now) return scoped;
    if (scoped) {
      await tx.cartMutation.delete({ where: { id: scoped.id } });
    }

    const legacy = await tx.cartMutation.findUnique({
      where: {
        customerId_idempotencyKey: {
          customerId,
          idempotencyKey: legacyKey,
        },
      },
    });
    if (legacy && legacy.expiresAt > now) return legacy;
    if (legacy) {
      await tx.cartMutation.delete({ where: { id: legacy.id } });
    }
    return null;
  }

  private async cleanupExpiredMutations(
    tx: Prisma.TransactionClient,
    customerId: string,
    now: Date,
  ): Promise<void> {
    const expired = await tx.cartMutation.findMany({
      where: { customerId, expiresAt: { lte: now } },
      orderBy: [{ expiresAt: 'asc' }, { id: 'asc' }],
      select: { id: true },
      take: EXPIRED_CLEANUP_BATCH,
    });
    if (expired.length > 0) {
      await tx.cartMutation.deleteMany({
        where: { id: { in: expired.map(({ id }) => id) } },
      });
    }
  }

  private async persistedCartResult(
    tx: Prisma.TransactionClient,
    cartId: string,
    quotedAt = new Date(),
  ): Promise<CartMutationResult> {
    const cart = await tx.cart.findUniqueOrThrow({
      where: { id: cartId },
      include: cartInclude(),
    });
    return {
      cartId,
      response: { data: { cart: buildCartView(cart, quotedAt) } },
    };
  }

  private async requireSellableVariant(
    tx: Prisma.TransactionClient,
    variantId: string,
  ): Promise<void> {
    const variant = await tx.productVariant.findFirst({
      where: {
        id: variantId,
        isActive: true,
        status: 'ACTIVE',
        product: { status: 'ACTIVE' },
      },
      select: { id: true },
    });
    if (!variant) {
      throw new NotFoundException({
        code: 'SKU_NOT_FOUND',
        message: 'Variant not found.',
      });
    }
  }

  private async customer(userId: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!customer) {
      throw new ConflictException({
        code: 'CONFLICT',
        message: 'Customer profile is not linked to the authenticated user.',
      });
    }
    return customer;
  }

  private async withSerializableRetry<T>(
    operation: () => Promise<T>,
  ): Promise<T> {
    for (let attempt = 1; attempt <= SERIALIZABLE_RETRIES; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        if (!isRetryableContention(error)) throw error;
        if (attempt === SERIALIZABLE_RETRIES) {
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
}

function normalizeIdempotencyKey(value: string): string {
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

function normalizeVariantId(value: string): string {
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

function validateQuantity(quantity: number): void {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
    throw new UnprocessableEntityException({
      code: 'CART_QUANTITY_INVALID',
      message: 'Quantity must be between 1 and 99.',
    });
  }
}

function lineLimitExceeded(): ConflictException {
  return new ConflictException({
    code: 'CART_LINE_LIMIT_EXCEEDED',
    message: 'Cart line limit exceeded.',
  });
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
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
  const exponential = RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
  const delayMs = Math.min(
    100,
    exponential + randomInt(RETRY_BASE_DELAY_MS + 1),
  );
  await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
}
