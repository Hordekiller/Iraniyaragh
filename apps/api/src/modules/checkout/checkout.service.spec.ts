import { describe, expect, it, vi } from 'vitest';
import { ErrorCodes } from '../../common/errors/app-error';
import { CheckoutService } from './checkout.service';

type MockTx = {
  order: { findFirst: vi.Mock; create: vi.Mock; count: vi.Mock };
  cart: { findFirst: vi.Mock };
  cartItem: { deleteMany: vi.Mock };
  price: { findFirst: vi.Mock };
  customer: { upsert: vi.Mock };
  inventoryBalance: { aggregate: vi.Mock; findMany: vi.Mock; update: vi.Mock };
  stockReservation: { create: vi.Mock };
};

type MockPrisma = {
  $transaction: vi.Mock;
};

function makePrisma(
  overrides: Partial<MockTx> = {},
): { prisma: MockPrisma; tx: MockTx } {
  const tx: MockTx = {
    order: { findFirst: vi.fn(), create: vi.fn(), count: vi.fn() },
    cart: { findFirst: vi.fn() },
    cartItem: { deleteMany: vi.fn() },
    price: { findFirst: vi.fn() },
    customer: { upsert: vi.fn() },
    inventoryBalance: { aggregate: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    stockReservation: { create: vi.fn() },
    ...overrides,
  };
  const prisma: MockPrisma = {
    $transaction: vi.fn(async (work: (t: unknown) => Promise<unknown>) => work(tx)),
  };
  return { prisma, tx };
}

const CUSTOMER = { mobile: '+989125553344', firstName: 'Ali', lastName: 'Rezaei' };
const serviceFor = (prisma: MockPrisma) =>
  new CheckoutService(prisma as unknown as never, {} as unknown as never);

describe('CheckoutService.checkout', () => {
  it('requires an idempotency key', async () => {
    const { prisma } = makePrisma();
    await expect(serviceFor(prisma).checkout({ guestToken: 'g' }, undefined, CUSTOMER)).rejects.toMatchObject({
      code: ErrorCodes.IDEMPOTENCY_CONFLICT,
    });
  });

  it('rejects a line below the price minQuantity', async () => {
    const { prisma, tx } = makePrisma();
    tx.order.findFirst.mockResolvedValue(null);
    tx.cart.findFirst.mockResolvedValue({
      id: 'cart-1',
      items: [
        { id: 'ci-1', skuId: 'sku-1', quantity: 1, sku: { sku: 'SKU-1', title: 'Widget' } },
      ],
    });
    tx.price.findFirst.mockResolvedValue({ amount: 1_000_000n, minQuantity: 5 });

    await expect(serviceFor(prisma).checkout({ guestToken: 'g' }, 'key-1', CUSTOMER)).rejects.toMatchObject({
      code: ErrorCodes.MIN_QUANTITY_NOT_MET,
      message: expect.stringContaining('Minimum quantity 5'),
    });
  });

  it('prices server-side from the active price row, ignoring any client amount', async () => {
    const { prisma, tx } = makePrisma();
    tx.order.findFirst.mockResolvedValue(null);
    tx.cart.findFirst.mockResolvedValue({
      id: 'cart-1',
      items: [
        { id: 'ci-1', skuId: 'sku-1', quantity: 2, sku: { sku: 'SKU-1', title: 'Widget' } },
      ],
    });
    tx.price.findFirst.mockResolvedValue({ amount: 1_000_000n, minQuantity: 1 });
    tx.inventoryBalance.aggregate.mockResolvedValue({ _sum: { available: 100 } });
    tx.inventoryBalance.findMany.mockResolvedValue([
      { id: 'b1', warehouseId: 'w1', locationId: 'l1', skuId: 'sku-1', available: 10, reserved: 0 },
    ]);
    tx.customer.upsert.mockResolvedValue({ id: 'cust-1' });
    tx.stockReservation.create.mockResolvedValue({});
    tx.order.create.mockImplementation(({ data }) =>
      Promise.resolve({
        id: 'ord-1',
        number: 'ORD-000001',
        status: 'PENDING_PAYMENT',
        ...data,
        items: data.items.create,
        discount: 0n,
        shipping: 0n,
      }),
    );
    tx.order.count.mockResolvedValue(0);

    const result = await serviceFor(prisma).checkout({ guestToken: 'g' }, 'key-2', CUSTOMER);

    expect(result.subtotal).toBe(2_000_000);
    expect(result.grandTotal).toBe(2_000_000);
    // The unit price written to the order is the DB price row (1,000,000), never
    // a client-supplied amount.
    const createArgs = tx.order.create.mock.calls[0][0];
    expect(createArgs.data.items.create[0].unitPrice).toBe(1_000_000n);
    expect(tx.order.create).toHaveBeenCalledTimes(1);
  });
});
