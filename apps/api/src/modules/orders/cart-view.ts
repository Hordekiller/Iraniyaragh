import { Prisma } from '@prisma/client';
import type { CartView } from '@iranyaragh/contracts';

export const cartInclude = () =>
  ({
    items: {
      orderBy: [{ variantId: 'asc' }, { id: 'asc' }],
      include: {
        variant: {
          include: {
            product: true,
            inventory: {
              where: {
                warehouse: { isActive: true },
                location: { isActive: true },
              },
              select: { available: true },
            },
          },
        },
      },
    },
  }) satisfies Prisma.CartInclude;

export type PricedCartRow = Prisma.CartGetPayload<{
  include: ReturnType<typeof cartInclude>;
}>;

export function buildCartView(
  cart: PricedCartRow,
  quotedAt = new Date(),
): CartView {
  const lines = cart.items.map((item) => {
    const amount = item.variant.salePrice.toString();
    return {
      variantId: item.variantId,
      quantity: item.quantity,
      title: item.variant.title ?? item.variant.product.name,
      sku: item.variant.sku,
      unitPrice: { amount, currency: 'IRR' as const },
      lineTotal: {
        amount: (BigInt(amount) * BigInt(item.quantity)).toString(),
        currency: 'IRR' as const,
      },
      available: item.variant.inventory.reduce(
        (sum, balance) => sum + balance.available,
        0,
      ),
    };
  });
  const subtotal = lines
    .reduce((sum, line) => sum + BigInt(line.lineTotal.amount), 0n)
    .toString();

  return {
    id: cart.id,
    version: cart.version,
    lines,
    quote: {
      subtotal: { amount: subtotal, currency: 'IRR' },
      shipping: { amount: '0', currency: 'IRR' },
      total: { amount: subtotal, currency: 'IRR' },
      currency: 'IRR',
      pricePolicyRevision: 'catalog-sale-price-v1',
      quotedAt: quotedAt.toISOString(),
    },
    updatedAt: cart.updatedAt.toISOString(),
  };
}

export function buildEmptyCartView(quotedAt = new Date()): CartView {
  return {
    id: null,
    version: 0,
    lines: [],
    quote: {
      subtotal: { amount: '0', currency: 'IRR' },
      shipping: { amount: '0', currency: 'IRR' },
      total: { amount: '0', currency: 'IRR' },
      currency: 'IRR',
      pricePolicyRevision: 'catalog-sale-price-v1',
      quotedAt: quotedAt.toISOString(),
    },
    updatedAt: null,
  };
}
