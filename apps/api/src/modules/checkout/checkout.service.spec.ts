import { ErrorCodes } from '../../common/errors/app-error';
import { CheckoutService } from './checkout.service';

type MockTx = {
  order: { findFirst: jest.Mock; create: jest.Mock; count: jest.Mock };
  cart: { findFirst: jest.Mock };
  cartItem: { deleteMany: jest.Mock };
  price: { findFirst: jest.Mock };
  customer: { upsert: jest.Mock };
  inventoryBalance: { aggregate: jest.Mock; findMany: jest.Mock; update: jest.Mock };
  stockReservation: { create: jest.Mock };
};

type MockPrisma = {
  $transaction: jest.Mock;
};

function makePrisma(
  overrides: Partial<MockTx> = {},
): { prisma: MockPrisma; tx: MockTx } {
  const tx: MockTx = {
    order: { findFirst: jest.fn(), create: jest.fn(), count: jest.fn() },
    cart: { findFirst: jest.fn() },
    cartItem: { deleteMany: jest.fn() },
    price: { findFirst: jest.fn() },
    customer: { upsert: jest.fn() },
    inventoryBalance: { aggregate: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    stockReservation: { create: jest.fn() },
    ...overrides,
  };
  const prisma: MockPrisma = {
    $transaction: jest.fn(async (work: (t: unknown) => Promise<unknown>) => work(tx)),
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
