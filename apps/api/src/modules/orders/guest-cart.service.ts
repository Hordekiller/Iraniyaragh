import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  CartMergeResponse,
  CartMergeWarning,
  CartResponse,
} from '@iranyaragh/contracts';
import { PrismaService } from '../../database/prisma.service';
import { AuditLogService } from '../audit/audit-log.service';
import {
  CART_EXPIRED_CLEANUP_BATCH,
  CART_REPLAY_TTL_MS,
  CUSTOMER_CART_SCOPES,
  GUEST_CART_IDLE_TTL_MS,
  GUEST_CART_SCOPES,
  MAX_CART_LINES,
  MAX_CART_QUANTITY,
} from './cart.constants';
import {
  cartLineLimitExceeded,
  cleanupCustomerCartMutations,
  hashCartValue,
  normalizeCartMutationKey,
  normalizeCartServiceVariantId,
  runCartSerializable,
  validateCartQuantity,
} from './cart-runtime';
import { buildCartView, buildEmptyCartView, cartInclude } from './cart-view';

const SHA256_PATTERN = /^[0-9a-f]{64}$/u;

type GuestMutationResult = Readonly<{
  response: CartResponse;
  replacementTokenHash: string | null;
}>;

type GuestReadResult = Readonly<{
  response: CartResponse;
  credentialState: 'missing' | 'active' | 'expired';
}>;

type GuestCartIdentity = Readonly<{
  id: string;
  replacementTokenHash: string | null;
}>;

@Injectable()
export class GuestCartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  async sweepExpired(
    now = new Date(),
    batchSize = CART_EXPIRED_CLEANUP_BATCH,
  ): Promise<number> {
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 500) {
      throw new RangeError('Guest Cart cleanup batch size must be 1..500.');
    }
    return runCartSerializable(() =>
      this.prisma.$transaction(
        async (tx) => {
          const candidates = await tx.cart.findMany({
            where: {
              customerId: null,
              guestExpiresAt: { lte: now },
            },
            orderBy: [{ guestExpiresAt: 'asc' }, { id: 'asc' }],
            select: { id: true },
            take: batchSize,
          });
          if (candidates.length === 0) return 0;
          const deleted = await tx.cart.deleteMany({
            where: {
              id: { in: candidates.map(({ id }) => id) },
              customerId: null,
              guestExpiresAt: { lte: now },
            },
          });
          return deleted.count;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
  }

  async getForToken(tokenHash: string | null): Promise<GuestReadResult> {
    if (tokenHash === null) {
      return {
        response: { data: { cart: buildEmptyCartView() } },
        credentialState: 'missing',
      };
    }
    requireTokenHash(tokenHash);

    return runCartSerializable(() =>
      this.prisma.$transaction(
        async (tx) => {
          const now = new Date();
          const cart = await tx.cart.findUnique({
            where: { guestTokenHash: tokenHash },
          });
          if (!cart) {
            return {
              response: { data: { cart: buildEmptyCartView(now) } },
              credentialState: 'missing',
            };
          }
          if (!cart.guestExpiresAt || cart.guestExpiresAt <= now) {
            await tx.cart.delete({ where: { id: cart.id } });
            return {
              response: { data: { cart: buildEmptyCartView(now) } },
              credentialState: 'expired',
            };
          }

          const touched = await tx.cart.update({
            where: { id: cart.id },
            data: {
              guestExpiresAt: new Date(now.getTime() + GUEST_CART_IDLE_TTL_MS),
            },
            include: cartInclude(),
          });
          return {
            response: { data: { cart: buildCartView(touched, now) } },
            credentialState: 'active',
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
  }

  async addForToken(
    currentTokenHash: string,
    replacementTokenHashes: readonly string[],
    input: { variantId: string; quantity: number },
    key: string,
  ): Promise<GuestMutationResult> {
    const variantId = normalizeCartServiceVariantId(input.variantId);
    validateCartQuantity(input.quantity);
    return this.runGuestMutation(
      currentTokenHash,
      replacementTokenHashes,
      GUEST_CART_SCOPES.add,
      normalizeCartMutationKey(key),
      { variantId, quantity: input.quantity },
      (tx, cartId, now) =>
        this.writeLine(
          tx,
          cartId,
          variantId,
          (currentQuantity) =>
            currentQuantity === null
              ? input.quantity
              : currentQuantity + input.quantity,
          now,
        ),
    );
  }

  async setForToken(
    currentTokenHash: string,
    replacementTokenHashes: readonly string[],
    variantIdInput: string,
    quantity: number,
    key: string,
  ): Promise<GuestMutationResult> {
    const variantId = normalizeCartServiceVariantId(variantIdInput);
    validateCartQuantity(quantity);
    return this.runGuestMutation(
      currentTokenHash,
      replacementTokenHashes,
      GUEST_CART_SCOPES.set,
      normalizeCartMutationKey(key),
      { variantId, quantity },
      (tx, cartId, now) =>
        this.writeLine(tx, cartId, variantId, () => quantity, now),
    );
  }

  async removeForToken(
    currentTokenHash: string,
    replacementTokenHashes: readonly string[],
    variantIdInput: string,
    key: string,
  ): Promise<GuestMutationResult> {
    const variantId = normalizeCartServiceVariantId(variantIdInput);
    return this.runGuestMutation(
      currentTokenHash,
      replacementTokenHashes,
      GUEST_CART_SCOPES.remove,
      normalizeCartMutationKey(key),
      { variantId },
      async (tx, cartId, now) => {
        const deleted = await tx.cartItem.deleteMany({
          where: { cartId, variantId },
        });
        await tx.cart.update({
          where: { id: cartId },
          data: {
            guestExpiresAt: new Date(
              now.getTime() + GUEST_CART_IDLE_TTL_MS,
            ),
            ...(deleted.count > 0 ? { version: { increment: 1 } } : {}),
          },
        });
        return this.persistedCartResponse(tx, cartId, now);
      },
    );
  }

  async mergeForUser(
    userId: string,
    guestTokenHash: string | null,
    key: string,
    requestId: string,
  ): Promise<CartMergeResponse> {
    if (guestTokenHash !== null) requireTokenHash(guestTokenHash);
    const idempotencyKey = normalizeCartMutationKey(key);
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

    const scope = CUSTOMER_CART_SCOPES.mergeGuest;
    const keyHash = hashCartValue(idempotencyKey);
    const fingerprint = hashCartValue(
      JSON.stringify({ scope, payload: { guestTokenHash } }),
    );

    return runCartSerializable(() =>
      this.prisma.$transaction(
        async (tx) => {
          const now = new Date();
          await cleanupCustomerCartMutations(tx, customer.id, now);
          const prior = await tx.cartMutation.findUnique({
            where: {
              customerId_scope_keyHash: {
                customerId: customer.id,
                scope,
                keyHash,
              },
            },
          });
          if (prior && prior.expiresAt > now) {
            if (
              guestTokenHash !== null &&
              prior.fingerprint !== fingerprint
            ) {
              throw idempotencyConflict();
            }
            return prior.responseJson as unknown as CartMergeResponse;
          }
          if (prior) {
            await tx.cartMutation.delete({ where: { id: prior.id } });
          }

          const guestCart = guestTokenHash
            ? await tx.cart.findUnique({
                where: { guestTokenHash },
                include: {
                  items: {
                    orderBy: [{ variantId: 'asc' }, { id: 'asc' }],
                  },
                },
              })
            : null;
          const guestIsActive =
            guestCart?.guestExpiresAt !== null &&
            guestCart?.guestExpiresAt !== undefined &&
            guestCart.guestExpiresAt > now;

          let customerCart = await tx.cart.findUnique({
            where: { customerId: customer.id },
          });
          const warnings: CartMergeWarning[] = [];
          let mergedLineCount = 0;

          if (guestCart && guestIsActive && guestCart.items.length > 0) {
            customerCart ??= await tx.cart.create({
              data: { customerId: customer.id },
            });
            const customerItems = await tx.cartItem.findMany({
              where: { cartId: customerCart.id },
              orderBy: [{ variantId: 'asc' }, { id: 'asc' }],
              select: { id: true, variantId: true, quantity: true },
            });
            const customerByVariant = new Map(
              customerItems.map((item) => [item.variantId, item]),
            );
            let remainingSlots = MAX_CART_LINES - customerItems.length;
            const creates: Array<{
              cartId: string;
              variantId: string;
              quantity: number;
            }> = [];

            for (const guestItem of guestCart.items) {
              const existing = customerByVariant.get(guestItem.variantId);
              if (existing) {
                const summed = existing.quantity + guestItem.quantity;
                const quantity = Math.min(MAX_CART_QUANTITY, summed);
                if (summed > MAX_CART_QUANTITY) {
                  warnings.push({
                    variantId: guestItem.variantId,
                    code: 'QUANTITY_CAPPED',
                  });
                }
                if (quantity !== existing.quantity) {
                  await tx.cartItem.update({
                    where: { id: existing.id },
                    data: { quantity },
                  });
                  mergedLineCount += 1;
                }
                continue;
              }
              if (remainingSlots === 0) {
                warnings.push({
                  variantId: guestItem.variantId,
                  code: 'LINE_LIMIT_REACHED',
                });
                continue;
              }
              creates.push({
                cartId: customerCart.id,
                variantId: guestItem.variantId,
                quantity: guestItem.quantity,
              });
              remainingSlots -= 1;
              mergedLineCount += 1;
            }
            if (creates.length > 0) {
              await tx.cartItem.createMany({ data: creates });
            }
            if (mergedLineCount > 0) {
              customerCart = await tx.cart.update({
                where: { id: customerCart.id },
                data: { version: { increment: 1 } },
              });
            }
          }

          if (guestCart) {
            await tx.cart.delete({ where: { id: guestCart.id } });
          }

          const response: CartMergeResponse = {
            data: {
              cart: customerCart
                ? buildCartView(
                    await tx.cart.findUniqueOrThrow({
                      where: { id: customerCart.id },
                      include: cartInclude(),
                    }),
                    now,
                  )
                : buildEmptyCartView(now),
              warnings,
            },
          };
          await tx.cartMutation.create({
            data: {
              cartId: customerCart?.id ?? null,
              customerId: customer.id,
              scope,
              idempotencyKey: null,
              keyHash,
              fingerprint,
              responseJson: response as unknown as Prisma.InputJsonValue,
              expiresAt: new Date(now.getTime() + CART_REPLAY_TTL_MS),
            },
          });

          if (guestCart && guestIsActive) {
            await this.auditLog.record(
              {
                action: 'cart.guest.merged',
                entityType: customerCart ? 'cart' : 'customer',
                entityId: customerCart?.id ?? customer.id,
                metadata: {
                  mergedLineCount,
                  warningCount: warnings.length,
                  warningCodes: [...new Set(warnings.map(({ code }) => code))],
                },
                actorId: userId,
                requestId,
              },
              tx,
            );
          }
          return response;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
  }

  private async runGuestMutation(
    currentTokenHash: string,
    replacementTokenHashes: readonly string[],
    scope: (typeof GUEST_CART_SCOPES)[keyof typeof GUEST_CART_SCOPES],
    idempotencyKey: string,
    payload: Record<string, unknown>,
    operation: (
      tx: Prisma.TransactionClient,
      cartId: string,
      now: Date,
    ) => Promise<CartResponse>,
  ): Promise<GuestMutationResult> {
    requireTokenHash(currentTokenHash);
    if (replacementTokenHashes.length === 0) {
      throw new BadRequestException({
        code: 'INVALID_REQUEST',
        message: 'At least one replacement guest credential is required.',
      });
    }
    replacementTokenHashes.forEach(requireTokenHash);
    const keyHash = hashCartValue(idempotencyKey);
    const fingerprint = hashCartValue(JSON.stringify({ scope, payload }));

    return runCartSerializable(() =>
      this.prisma.$transaction(
        async (tx) => {
          const now = new Date();
          const identity = await this.resolveGuestCart(
            tx,
            currentTokenHash,
            replacementTokenHashes,
            now,
          );
          await this.cleanupGuestMutations(tx, identity.id, now);
          const prior = await tx.guestCartMutation.findUnique({
            where: {
              cartId_scope_keyHash: {
                cartId: identity.id,
                scope,
                keyHash,
              },
            },
          });
          if (prior && prior.expiresAt > now) {
            if (prior.fingerprint !== fingerprint) {
              throw idempotencyConflict();
            }
            await tx.cart.update({
              where: { id: identity.id },
              data: {
                guestExpiresAt: new Date(
                  now.getTime() + GUEST_CART_IDLE_TTL_MS,
                ),
              },
            });
            return {
              response: prior.responseJson as unknown as CartResponse,
              replacementTokenHash: identity.replacementTokenHash,
            };
          }
          if (prior) {
            await tx.guestCartMutation.delete({ where: { id: prior.id } });
          }

          const response = await operation(tx, identity.id, now);
          await tx.guestCartMutation.create({
            data: {
              cartId: identity.id,
              scope,
              keyHash,
              fingerprint,
              responseJson: response as unknown as Prisma.InputJsonValue,
              expiresAt: new Date(now.getTime() + CART_REPLAY_TTL_MS),
            },
          });
          return {
            response,
            replacementTokenHash: identity.replacementTokenHash,
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
  }

  private async resolveGuestCart(
    tx: Prisma.TransactionClient,
    currentTokenHash: string,
    replacementTokenHashes: readonly string[],
    now: Date,
  ): Promise<GuestCartIdentity> {
    const current = await tx.cart.findUnique({
      where: { guestTokenHash: currentTokenHash },
    });
    if (current?.guestExpiresAt && current.guestExpiresAt > now) {
      return { id: current.id, replacementTokenHash: null };
    }
    if (!current) {
      const created = await tx.cart.create({
        data: {
          guestTokenHash: currentTokenHash,
          guestExpiresAt: new Date(now.getTime() + GUEST_CART_IDLE_TTL_MS),
        },
        select: { id: true },
      });
      return { id: created.id, replacementTokenHash: null };
    }
    await tx.cart.delete({ where: { id: current.id } });
    await tx.cart.deleteMany({
      where: {
        customerId: null,
        guestTokenHash: { in: [...replacementTokenHashes] },
        guestExpiresAt: { lte: now },
      },
    });
    const existingReplacement = await tx.cart.findFirst({
      where: {
        guestTokenHash: { in: [...replacementTokenHashes] },
        guestExpiresAt: { gt: now },
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true, guestTokenHash: true },
    });
    if (existingReplacement?.guestTokenHash) {
      return {
        id: existingReplacement.id,
        replacementTokenHash: existingReplacement.guestTokenHash,
      };
    }
    const replacementTokenHash = replacementTokenHashes[0]!;
    const created = await tx.cart.create({
      data: {
        guestTokenHash: replacementTokenHash,
        guestExpiresAt: new Date(now.getTime() + GUEST_CART_IDLE_TTL_MS),
      },
      select: { id: true },
    });
    return { id: created.id, replacementTokenHash };
  }

  private async writeLine(
    tx: Prisma.TransactionClient,
    cartId: string,
    variantId: string,
    resolveQuantity: (currentQuantity: number | null) => number,
    now: Date,
  ): Promise<CartResponse> {
    await this.requireSellableVariant(tx, variantId);
    const line = await tx.cartItem.findUnique({
      where: { cartId_variantId: { cartId, variantId } },
    });
    if (
      !line &&
      (await tx.cartItem.count({ where: { cartId } })) >= MAX_CART_LINES
    ) {
      throw cartLineLimitExceeded();
    }
    const quantity = resolveQuantity(line?.quantity ?? null);
    validateCartQuantity(quantity);
    if (line?.quantity !== quantity) {
      await tx.cartItem.upsert({
        where: { cartId_variantId: { cartId, variantId } },
        create: { cartId, variantId, quantity },
        update: { quantity },
      });
    }
    await tx.cart.update({
      where: { id: cartId },
      data: {
        guestExpiresAt: new Date(now.getTime() + GUEST_CART_IDLE_TTL_MS),
        ...(line?.quantity !== quantity ? { version: { increment: 1 } } : {}),
      },
    });
    return this.persistedCartResponse(tx, cartId, now);
  }

  private async persistedCartResponse(
    tx: Prisma.TransactionClient,
    cartId: string,
    quotedAt: Date,
  ): Promise<CartResponse> {
    const cart = await tx.cart.findUniqueOrThrow({
      where: { id: cartId },
      include: cartInclude(),
    });
    return { data: { cart: buildCartView(cart, quotedAt) } };
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

  private async cleanupGuestMutations(
    tx: Prisma.TransactionClient,
    cartId: string,
    now: Date,
  ): Promise<void> {
    const expired = await tx.guestCartMutation.findMany({
      where: { cartId, expiresAt: { lte: now } },
      orderBy: [{ expiresAt: 'asc' }, { id: 'asc' }],
      select: { id: true },
      take: CART_EXPIRED_CLEANUP_BATCH,
    });
    if (expired.length > 0) {
      await tx.guestCartMutation.deleteMany({
        where: { id: { in: expired.map(({ id }) => id) } },
      });
    }
  }

}

function requireTokenHash(value: string): void {
  if (!SHA256_PATTERN.test(value)) {
    throw new BadRequestException({
      code: 'INVALID_REQUEST',
      message: 'Guest cart token digest is invalid.',
    });
  }
}

function idempotencyConflict(): ConflictException {
  return new ConflictException({
    code: 'IDEMPOTENCY_CONFLICT',
    message: 'Idempotency key payload conflict.',
  });
}
