import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CartResponse } from '@iranyaragh/contracts';
import { PrismaService } from '../../database/prisma.service';
import {
  CART_REPLAY_TTL_MS,
  CUSTOMER_CART_SCOPES,
  MAX_CART_LINES,
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
    const variantId = normalizeCartServiceVariantId(input.variantId);
    validateCartQuantity(input.quantity);
    const idempotencyKey = normalizeCartMutationKey(key);
    const customer = await this.customer(userId);

    return this.runMutation(
      customer.id,
      CUSTOMER_CART_SCOPES.add,
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
    const variantId = normalizeCartServiceVariantId(variantIdInput);
    const idempotencyKey = normalizeCartMutationKey(key);
    const customer = await this.customer(userId);

    return this.runMutation(
      customer.id,
      CUSTOMER_CART_SCOPES.remove,
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
    const variantId = normalizeCartServiceVariantId(variantIdInput);
    validateCartQuantity(quantity);
    const idempotencyKey = normalizeCartMutationKey(key);
    const customer = await this.customer(userId);

    return this.runMutation(
      customer.id,
      CUSTOMER_CART_SCOPES.set,
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
      (await tx.cartItem.count({ where: { cartId: cart.id } })) >= MAX_CART_LINES
    ) {
      throw cartLineLimitExceeded();
    }

    const quantity = resolveQuantity(line?.quantity ?? null);
    validateCartQuantity(quantity);
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
    scope: (typeof CUSTOMER_CART_SCOPES)[keyof typeof CUSTOMER_CART_SCOPES],
    idempotencyKey: string,
    payload: Record<string, unknown>,
    operation: (
      tx: Prisma.TransactionClient,
      now: Date,
    ) => Promise<CartMutationResult>,
  ): Promise<CartResponse> {
    const keyHash = hashCartValue(idempotencyKey);
    const fingerprint = hashCartValue(JSON.stringify({ scope, payload }));

    return runCartSerializable(() =>
      this.prisma.$transaction(
        async (tx) => {
          const now = new Date();
          await cleanupCustomerCartMutations(tx, customerId, now);
          const prior = await this.findReplay(
            tx,
            customerId,
            scope,
            keyHash,
            idempotencyKey,
            now,
          );
          if (prior) {
            const legacyFingerprint = hashCartValue(JSON.stringify(payload));
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
              expiresAt: new Date(now.getTime() + CART_REPLAY_TTL_MS),
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

}
