import { describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@prisma/client';
import { StaffOrderService } from './staff-order.service';
import { AuditLogService } from '../audit/audit-log.service';
import { PrismaService } from '../../database/prisma.service';
import type { CheckoutAddress } from '@iranyaragh/contracts';

const address: CheckoutAddress = {
  provinceCode: 'THR',
  city: 'Tehran',
  address: 'Valiasr St',
  postalCode: '1234567890',
  recipient: 'Buyer',
  mobile: '+989120000000',
};

function build() {
  const prisma = {
    $transaction: vi.fn(),
  } as unknown as PrismaService;
  const audit = {
    record: vi.fn(async () => undefined),
  } as unknown as AuditLogService;
  return {
    service: new StaffOrderService(prisma, audit),
    prisma: prisma as unknown as { $transaction: ReturnType<typeof vi.fn> },
  };
}

const context = {
  actorId: 'staff-1',
  requestId: 'req-1',
  idempotencyKey: 'key-1',
};

describe('StaffOrderService request validation', () => {
  it('rejects an empty line list', async () => {
    const { service } = build();
    await expect(
      service.create({
        ...context,
        payload: { customerId: 'c1', lines: [], address },
      }),
    ).rejects.toMatchObject({ response: { code: 'INVALID_REQUEST' } });
  });

  it('rejects more lines than the cap', async () => {
    const { service } = build();
    const lines = Array.from({ length: 51 }, (_, index) => ({
      variantId: `v${index}`,
      quantity: 1,
    }));
    await expect(
      service.create({ ...context, payload: { customerId: 'c1', lines, address } }),
    ).rejects.toMatchObject({ response: { code: 'INVALID_REQUEST' } });
  });

  it('rejects a duplicated variant instead of silently merging it', async () => {
    const { service } = build();
    await expect(
      service.create({
        ...context,
        payload: {
          customerId: 'c1',
          lines: [
            { variantId: 'v1', quantity: 1 },
            { variantId: 'v1', quantity: 2 },
          ],
          address,
        },
      }),
    ).rejects.toMatchObject({ response: { code: 'DUPLICATE_LINE' } });
  });

  it.each([0, -1, 1.5, 1001])(
    'rejects the out-of-range quantity %s',
    async (quantity) => {
      const { service } = build();
      await expect(
        service.create({
          ...context,
          payload: { customerId: 'c1', lines: [{ variantId: 'v1', quantity }], address },
        }),
      ).rejects.toMatchObject({ response: { code: 'INVALID_REQUEST' } });
    },
  );

  it('rejects a guest submission with an explicit unsupported code', async () => {
    const { service } = build();
    for (const customerId of [undefined, null, '', '   ']) {
      await expect(
        service.create({
          ...context,
          payload: {
            customerId: customerId as unknown as string,
            lines: [{ variantId: 'v1', quantity: 1 }],
            address,
          },
        }),
      ).rejects.toMatchObject({
        response: { code: 'GUEST_ORDER_UNSUPPORTED' },
        status: 422,
      });
    }
  });

  it('truncates an over-long note instead of rejecting the order', async () => {
    const { service, prisma } = build();
    prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
      expect(typeof fn).toBe('function');
      throw new Error('reached-transaction');
    });

    await expect(
      service.create({
        ...context,
        payload: {
          customerId: 'c1',
          lines: [{ variantId: 'v1', quantity: 1 }],
          address,
          note: 'x'.repeat(900),
        },
      }),
    ).rejects.toThrow('reached-transaction');
  });

  it('normalises the address before hashing the fingerprint', async () => {
    const { service, prisma } = build();
    prisma.$transaction.mockImplementation(async () => {
      throw new Error('reached-transaction');
    });

    await expect(
      service.create({
        ...context,
        payload: {
          customerId: 'c1',
          lines: [{ variantId: 'v1', quantity: 1 }],
          address: { ...address, mobile: ' 09120000000 ' },
        },
      }),
    ).rejects.toThrow('reached-transaction');
  });

  it('uses the same serializable isolation as customer checkout', async () => {
    const { service, prisma } = build();
    const tx = { checkoutIdempotencyRecord: {} };
    prisma.$transaction.mockImplementation(
      async (
        fn: (client: Prisma.TransactionClient) => unknown,
        options: { isolationLevel: string },
      ) => {
        expect(options.isolationLevel).toBe('Serializable');
        return fn(tx as never);
      },
    );

    await expect(
      service.create({
        ...context,
        payload: { customerId: 'c1', lines: [{ variantId: 'v1', quantity: 1 }], address },
      }),
    ).rejects.toBeDefined();
  });
});
