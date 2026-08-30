import { Injectable } from '@nestjs/common';
import { PriceType, Prisma } from '@prisma/client';
import { buildPageMeta } from '../../common/dto/pagination.dto';
import { AppError, ErrorCodes } from '../../common/errors/app-error';
import { toRialNumber } from '../../common/money/money';
import { PrismaService } from '../../database/prisma.service';
import { InventoryService } from '../inventory/inventory.service';

export interface CartIdentity {
  userId?: string | null;
  guestToken?: string | null;
  clientRequestId?: string | null;
  userAgent?: string | null;
}

const cartInclude = {
  items: {
    include: {
      sku: {
        include: {
          prices: { where: { isActive: true }, orderBy: { effectiveFrom: 'desc' } },
          product: { select: { id: true, name: true, slug: true, status: true } },
        },
      },
    },
  },
} as const;

@Injectable()
export class CartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
  ) {}

  async getCart(identity: CartIdentity) {
    const cart = await this.findCart(identity);
    if (!cart) {
      return { id: null, items: [], subtotal: null, meta: buildPageMeta(0, 1, 0) };
    }
    return this.mapCart(cart);
  }

  async addItem(identity: CartIdentity, skuId: string, quantity: number) {
    await this.assertSkuSellable(skuId);
    const cart = await this.getOrCreateCart(identity);
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.cartItem.findUnique({
        where: { cartId_skuId: { cartId: cart.id, skuId } },
      });
      const nextQuantity = (existing?.quantity ?? 0) + quantity;
      if (existing) {
        await tx.cartItem.update({
          where: { id: existing.id },
          data: { quantity: nextQuantity },
        });
      } else {
        await tx.cartItem.create({ data: { cartId: cart.id, skuId, quantity } });
      }
      const hydrated = await this.getCart(identity);
      return hydrated;
    });
  }

  async updateQuantity(identity: CartIdentity, itemId: string, quantity: number) {
    const cart = await this.findCart(identity);
    if (!cart) {
      throw new AppError(ErrorCodes.CART_NOT_FOUND, 'Cart not found.', 404);
    }
    const item = await this.prisma.cartItem.findFirst({
      where: { id: itemId, cartId: cart.id },
    });
    if (!item) {
      throw new AppError(ErrorCodes.NOT_FOUND, 'Cart item not found.', 404);
    }
    await this.prisma.cartItem.update({ where: { id: itemId }, data: { quantity } });
    return this.getCart(identity);
  }

  async removeItem(identity: CartIdentity, itemId: string) {
    const cart = await this.findCart(identity);
    if (!cart) {
      throw new AppError(ErrorCodes.CART_NOT_FOUND, 'Cart not found.', 404);
    }
    await this.prisma.cartItem.deleteMany({ where: { id: itemId, cartId: cart.id } });
    return this.getCart(identity);
  }

  async getCartEntity(identity: CartIdentity) {
    return this.findCart(identity);
  }

  private async findCart(identity: CartIdentity) {
    return this.prisma.cart.findFirst({
      where: {
        OR: [
          ...(identity.userId ? [{ userId: identity.userId }] : []),
          ...(identity.guestToken ? [{ guestToken: identity.guestToken }] : []),
        ],
      },
      include: cartInclude,
    });
  }

  private async getOrCreateCart(identity: CartIdentity) {
    const existing = await this.findCart(identity);
    if (existing) return existing;
    if (!identity.userId && !identity.guestToken) {
      throw new AppError(ErrorCodes.UNAUTHORIZED, 'Cart requires a user or guest token.', 401);
    }
    return this.prisma.cart.create({
      data: {
        userId: identity.userId ?? null,
        guestToken: identity.guestToken ?? null,
      },
    });
  }

  private async assertSkuSellable(skuId: string) {
    const sku = await this.prisma.sku.findFirst({
      where: { id: skuId, isActive: true, product: { status: 'ACTIVE' } },
    });
    if (!sku) {
      throw new AppError(ErrorCodes.SKU_NOT_FOUND, 'Active SKU not found.', 404);
    }
  }

  private async mapCart(cart: CartWithItems) {
    const items = await Promise.all(
      cart.items.map(async (item) => {
        const price = pickCurrentPrice(item.sku.prices);
        const available = await this.inventory.availableQuantity(item.sku.id);
        return {
          id: item.id,
          skuId: item.sku.id,
          skuCode: item.sku.sku,
          title: item.sku.title ?? item.sku.product.name,
          quantity: item.quantity,
          unitPrice: price.amount === null ? null : toRialNumber(price.amount),
          minQuantity: price.minQuantity,
          available,
        };
      }),
    );
    const subtotal = items.reduce<number | null>((sum, it) => {
      if (it.unitPrice === null) return sum;
      return (sum ?? 0) + it.unitPrice * it.quantity;
    }, null);

    return {
      id: cart.id,
      items,
      subtotal,
      meta: buildPageMeta(items.length, 1, items.length),
    };
  }
}

type PriceRow = {
  type: PriceType;
  amount: bigint;
  minQuantity: number;
};
type CartWithItems = Prisma.CartGetPayload<{ include: typeof cartInclude }>;

function pickCurrentPrice(prices: PriceRow[]): { amount: bigint | null; minQuantity: number } {
  if (prices.length === 0) return { amount: null, minQuantity: 1 };
  const sale = prices.find((p) => p.type === PriceType.SALE);
  const chosen = sale ?? prices[0];
  return { amount: chosen.amount, minQuantity: chosen.minQuantity };
}
