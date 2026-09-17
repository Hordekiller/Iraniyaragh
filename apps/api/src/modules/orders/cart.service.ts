import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import type { CartResponse } from '@iranyaragh/contracts';
import { PrismaService } from '../../database/prisma.service';

const MAX_LINES = 100;

@Injectable()
export class CartService {
  constructor(private readonly prisma: PrismaService) {}

  async getForUser(userId: string): Promise<CartResponse> {
    const customer = await this.customer(userId);
    const cart = await this.prisma.cart.upsert({ where: { customerId: customer.id }, create: { customerId: customer.id }, update: {}, include: this.include() });
    return { data: { cart: this.view(cart) } };
  }

  async addForUser(userId: string, input: { variantId: string; quantity: number }, key: string): Promise<CartResponse> {
    if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > 99) throw new UnprocessableEntityException({ code: 'CART_QUANTITY_INVALID', message: 'Quantity must be between 1 and 99.' });
    const customer = await this.customer(userId);
    const fingerprint = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    try { return await this.prisma.$transaction(async tx => {
      const prior = await tx.cartMutation.findUnique({ where: { customerId_idempotencyKey: { customerId: customer.id, idempotencyKey: key } } });
      if (prior) {
        if (prior.fingerprint !== fingerprint) throw new ConflictException({ code: 'IDEMPOTENCY_CONFLICT', message: 'Idempotency key payload conflict.' });
        return prior.responseJson as unknown as CartResponse;
      }
      const variant = await tx.productVariant.findFirst({ where: { id: input.variantId, isActive: true, status: 'ACTIVE', product: { status: 'ACTIVE' } }, select: { id: true } });
      if (!variant) throw new NotFoundException({ code: 'SKU_NOT_FOUND', message: 'Variant not found.' });
      const cart = await tx.cart.upsert({ where: { customerId: customer.id }, create: { customerId: customer.id }, update: {} });
      const line = await tx.cartItem.findUnique({ where: { cartId_variantId: { cartId: cart.id, variantId: input.variantId } } });
      if (!line && await tx.cartItem.count({ where: { cartId: cart.id } }) >= MAX_LINES) throw new ConflictException({ code: 'CART_LINE_LIMIT_EXCEEDED', message: 'Cart line limit exceeded.' });
      if (line && line.quantity + input.quantity > 99) throw new UnprocessableEntityException({ code: 'CART_QUANTITY_INVALID', message: 'Quantity must be between 1 and 99.' });
      const nextQuantity = line ? line.quantity + input.quantity : input.quantity;
      await tx.cartItem.upsert({ where: { cartId_variantId: { cartId: cart.id, variantId: input.variantId } }, create: { cartId: cart.id, variantId: input.variantId, quantity: nextQuantity }, update: { quantity: nextQuantity } });
      await tx.cart.update({ where: { id: cart.id }, data: { version: { increment: 1 } } });
      const result = { data: { cart: this.view(await tx.cart.findUniqueOrThrow({ where: { id: cart.id }, include: this.include() })) } };
      await tx.cartMutation.create({ data: { cartId: cart.id, customerId: customer.id, idempotencyKey: key, fingerprint, responseJson: result } });
      return result;
    }); } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const replay = await this.prisma.cartMutation.findUnique({ where: { customerId_idempotencyKey: { customerId: customer.id, idempotencyKey: key } } });
        if (replay && replay.fingerprint === fingerprint) return replay.responseJson as unknown as CartResponse;
      }
      throw error;
    }
  }

  async removeForUser(userId: string, variantId: string, key: string): Promise<CartResponse> {
    const customer = await this.customer(userId);
    const fingerprint = createHash('sha256').update(JSON.stringify({ variantId })).digest('hex');
    return this.prisma.$transaction(async tx => {
      const prior = await tx.cartMutation.findUnique({ where: { customerId_idempotencyKey: { customerId: customer.id, idempotencyKey: key } } });
      if (prior) {
        if (prior.fingerprint !== fingerprint) throw new ConflictException({ code: 'IDEMPOTENCY_CONFLICT', message: 'Idempotency key payload conflict.' });
        return prior.responseJson as unknown as CartResponse;
      }
      const cart = await tx.cart.upsert({ where: { customerId: customer.id }, create: { customerId: customer.id }, update: {} });
      {
        await tx.cartItem.deleteMany({ where: { cartId: cart.id, variantId } });
        await tx.cart.update({ where: { id: cart.id }, data: { version: { increment: 1 } } });
      }
      const current = await tx.cart.findUniqueOrThrow({ where: { customerId: customer.id }, include: this.include() });
      const result = { data: { cart: this.view(current) } };
      await tx.cartMutation.create({ data: { cartId: current.id, customerId: customer.id, idempotencyKey: key, fingerprint, responseJson: result } });
      return result;
    });
  }

  async setForUser(userId: string, variantId: string, quantity: number, key: string): Promise<CartResponse> {
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) throw new UnprocessableEntityException({ code: 'CART_QUANTITY_INVALID', message: 'Quantity must be between 1 and 99.' });
    const customer = await this.customer(userId);
    const fingerprint = createHash('sha256').update(JSON.stringify({ variantId, quantity })).digest('hex');
    try {
      return await this.prisma.$transaction(async tx => {
        const prior = await tx.cartMutation.findUnique({ where: { customerId_idempotencyKey: { customerId: customer.id, idempotencyKey: key } } });
        if (prior) {
          if (prior.fingerprint !== fingerprint) throw new ConflictException({ code: 'IDEMPOTENCY_CONFLICT', message: 'Idempotency key payload conflict.' });
          return prior.responseJson as unknown as CartResponse;
        }
        const variant = await tx.productVariant.findFirst({ where: { id: variantId, isActive: true, status: 'ACTIVE', product: { status: 'ACTIVE' } }, select: { id: true } });
        if (!variant) throw new NotFoundException({ code: 'SKU_NOT_FOUND', message: 'Variant not found.' });
        const cart = await tx.cart.upsert({ where: { customerId: customer.id }, create: { customerId: customer.id }, update: {} });
        const line = await tx.cartItem.findUnique({ where: { cartId_variantId: { cartId: cart.id, variantId } } });
        if (!line && await tx.cartItem.count({ where: { cartId: cart.id } }) >= MAX_LINES) throw new ConflictException({ code: 'CART_LINE_LIMIT_EXCEEDED', message: 'Cart line limit exceeded.' });
        await tx.cartItem.upsert({ where: { cartId_variantId: { cartId: cart.id, variantId } }, create: { cartId: cart.id, variantId, quantity }, update: { quantity } });
        await tx.cart.update({ where: { id: cart.id }, data: { version: { increment: 1 } } });
        const result = { data: { cart: this.view(await tx.cart.findUniqueOrThrow({ where: { id: cart.id }, include: this.include() })) } };
        await tx.cartMutation.create({ data: { cartId: cart.id, customerId: customer.id, idempotencyKey: key, fingerprint, responseJson: result } });
        return result;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const replay = await this.prisma.cartMutation.findUnique({ where: { customerId_idempotencyKey: { customerId: customer.id, idempotencyKey: key } } });
        if (replay && replay.fingerprint === fingerprint) return replay.responseJson as unknown as CartResponse;
      }
      throw error;
    }
  }

  private async customer(userId: string) {
    const customer = await this.prisma.customer.findUnique({ where: { userId } });
    if (!customer) throw new ConflictException({ code: 'CONFLICT', message: 'Customer profile is not linked to the authenticated user.' });
    return customer;
  }
  private include() { return { items: { include: { variant: { include: { product: true, inventory: { select: { available: true } } } } } } } as const; }
  private view(cart: Prisma.CartGetPayload<{ include: ReturnType<CartService['include']> }>) {
    const lines = cart.items.map(item => { const amount = item.variant.salePrice.toString(); return { variantId: item.variantId, quantity: item.quantity, title: item.variant.title ?? item.variant.product.name, sku: item.variant.sku, unitPrice: { amount, currency: 'IRR' as const }, lineTotal: { amount: (BigInt(amount) * BigInt(item.quantity)).toString(), currency: 'IRR' as const }, available: item.variant.inventory.reduce((sum, balance) => sum + balance.available, 0) }; });
    const subtotal = lines.reduce((sum, line) => sum + BigInt(line.lineTotal.amount), 0n).toString();
    return { id: cart.id, version: cart.version, lines, quote: { subtotal: { amount: subtotal, currency: 'IRR' as const }, shipping: { amount: '0', currency: 'IRR' as const }, total: { amount: subtotal, currency: 'IRR' as const }, currency: 'IRR' as const, pricePolicyRevision: 'catalog-sale-price-v1', quotedAt: new Date().toISOString() }, updatedAt: cart.updatedAt.toISOString() };
  }
}
