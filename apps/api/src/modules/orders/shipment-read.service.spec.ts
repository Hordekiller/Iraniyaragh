import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { ShipmentReadService } from './shipment-read.service';
import { AdminShipmentListQueryDto } from './shipment-read.dto';

const row = {
  id: 'shipment-1',
  orderId: 'order-1',
  carrier: 'post',
  trackingCode: 'TRACK-1',
  dispatchedAt: new Date('2026-09-20T10:00:00.000Z'),
  addressSnapshot: {
    provinceCode: 'THR',
    city: 'تهران',
    address: 'خیابان ولیعصر',
    postalCode: '1234567890',
    recipient: 'سارا احمدی',
    mobile: '+989120000001',
  },
  fulfillment: {
    status: 'SHIPPED' as const,
    id: 'fulfillment-1',
    transitions: [] as unknown[],
  },
  order: {
    number: 'ORD-1001',
    customer: { id: 'customer-1', firstName: 'سارا', lastName: 'احمدی', mobile: '+989120000001' },
  },
  lines: [
    {
      orderItemId: 'item-1',
      quantity: 2,
      orderItem: { sku: 'SKU-1', productTitle: 'پیچگوشتی', variantTitle: '۱۲ ولت' },
    },
  ],
};

function setup(overrides: Partial<typeof row> = {}) {
  const value = { ...row, ...overrides };
  const prisma = {
    shipment: {
      findMany: vi.fn(async () => [value]),
      count: vi.fn(async () => 1),
      findUnique: vi.fn(async () => ({
        ...value,
        actor: { id: 'staff-1', firstName: 'رضا', lastName: 'کریمی' },
      })),
    },
    $transaction: vi.fn(async (queries: Promise<unknown>[]) => Promise.all(queries)),
  };
  return { prisma, service: new ShipmentReadService(prisma as unknown as PrismaService) };
}

describe('ShipmentReadService', () => {
  it('summarizes shipments with masked customer identity and aggregated line counts', async () => {
    const { service } = setup();
    const result = await service.listShipments(Object.assign(new AdminShipmentListQueryDto(), {}));
    expect(result.data.items).toEqual([
      expect.objectContaining({
        id: 'shipment-1',
        orderNumber: 'ORD-1001',
        status: 'SHIPPED',
        carrier: 'post',
        trackingCode: 'TRACK-1',
        itemCount: 1,
        totalQuantity: 2,
        city: 'تهران',
        dispatchedAt: '2026-09-20T10:00:00.000Z',
        customer: {
          id: 'customer-1',
          displayNameMasked: 'س***',
          mobileMasked: '+9891*****001',
        },
      }),
    ]);
    expect(result.data.meta).toEqual({ page: 1, perPage: 25, total: 1, pages: 1 });
  });

  it('never returns unmasked address PII in the detail projection', async () => {
    const { service } = setup();
    const result = await service.getShipment('shipment-1');
    const shipment = result.data.shipment;
    expect(shipment.address).toEqual({
      provinceCode: 'THR',
      city: 'تهران',
      addressMasked: 'خ***',
      postalCodeMasked: '123*****90',
      recipientMasked: 'س***',
      mobileMasked: '+9891*****001',
    });
    expect(shipment.dispatchedBy).toEqual({ id: 'staff-1', displayNameMasked: 'ر***' });
    expect(shipment.lines).toEqual([
      {
        orderItemId: 'item-1',
        sku: 'SKU-1',
        productTitle: 'پیچگوشتی',
        variantTitle: '۱۲ ولت',
        quantity: 2,
      },
    ]);
  });

  it('rebuilds the timeline from persisted transitions and classifies the proof', async () => {
    const { service } = setup({
      fulfillment: {
        status: 'DELIVERED',
        id: 'fulfillment-1',
        transitions: [
          {
            id: 'transition-1',
            from: 'READY_TO_SHIP',
            to: 'SHIPPED',
            reason: null,
            requestId: 'req-1',
            createdAt: new Date('2026-09-20T10:00:00.000Z'),
            actor: { id: 'staff-1', firstName: 'رضا', lastName: 'کریمی' },
          },
          {
            id: 'transition-2',
            from: 'SHIPPED',
            to: 'DELIVERED',
            reason: 'STAFF_DELIVERY_PROOF:PROOF-4471',
            requestId: 'req-2',
            createdAt: new Date('2026-09-22T08:30:00.000Z'),
            actor: null,
          },
        ],
      },
    });

    const { timeline } = (await service.getShipment('shipment-1')).data.shipment;
    expect(timeline).toEqual([
      {
        id: 'transition-1',
        from: 'READY_TO_SHIP',
        to: 'SHIPPED',
        kind: 'DISPATCH',
        proofReference: null,
        actor: { id: 'staff-1', displayNameMasked: 'ر***' },
        requestId: 'req-1',
        createdAt: '2026-09-20T10:00:00.000Z',
      },
      {
        id: 'transition-2',
        from: 'SHIPPED',
        to: 'DELIVERED',
        kind: 'DELIVERY_PROOF',
        proofReference: 'PROOF-4471',
        actor: null,
        requestId: 'req-2',
        createdAt: '2026-09-22T08:30:00.000Z',
      },
    ]);
  });

  it('never echoes a free-text transition reason into the timeline', async () => {
    const { service } = setup({
      fulfillment: {
        status: 'RETURNED',
        id: 'fulfillment-1',
        transitions: [
          {
            id: 'transition-3',
            from: 'DELIVERED',
            to: 'RETURNED',
            reason: 'مشتری با شماره 09121234567 درخواست مرجوعی داد',
            requestId: null,
            createdAt: new Date('2026-09-25T12:00:00.000Z'),
            actor: { id: 'staff-3', firstName: null, lastName: null },
          },
        ],
      },
    });

    const result = await service.getShipment('shipment-1');
    expect(result.data.shipment.timeline).toEqual([
      expect.objectContaining({ kind: 'STATE_CHANGE', proofReference: null, requestId: null }),
    ]);
    expect(JSON.stringify(result)).not.toContain('09121234567');
    expect(JSON.stringify(result)).not.toContain('درخواست مرجوعی');
  });

  it('reads the timeline with a bounded, oldest-first window', async () => {
    const { prisma, service } = setup();
    await service.getShipment('shipment-1');
    const select = prisma.shipment.findUnique.mock.calls[0][0].select;
    expect(select.fulfillment.select.transitions).toEqual(
      expect.objectContaining({ orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: 50 }),
    );
  });

  it('degrades a malformed legacy address snapshot to null instead of leaking raw json', async () => {
    const { service } = setup({ addressSnapshot: { unexpected: 'shape' } });
    const result = await service.getShipment('shipment-1');
    expect(result.data.shipment.address).toBeNull();
  });

  it('filters by carrier, tracking code and dispatch range', async () => {
    const { prisma, service } = setup();
    await service.listShipments(
      Object.assign(new AdminShipmentListQueryDto(), {
        carrier: 'post',
        trackingCode: 'TRACK',
        status: 'SHIPPED',
        dispatchedFrom: '2026-09-01T00:00:00.000Z',
        dispatchedTo: '2026-10-01T00:00:00.000Z',
      }),
    );
    expect(prisma.shipment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          fulfillment: { is: { status: 'SHIPPED' } },
          carrier: { equals: 'post', mode: 'insensitive' },
          trackingCode: { contains: 'TRACK', mode: 'insensitive' },
          dispatchedAt: {
            gte: new Date('2026-09-01T00:00:00.000Z'),
            lte: new Date('2026-10-01T00:00:00.000Z'),
          },
        },
      }),
    );
  });

  it('orders by the requested sort column and paginates deterministically', async () => {
    const { prisma, service } = setup();
    await service.listShipments(
      Object.assign(new AdminShipmentListQueryDto(), {
        page: 3,
        perPage: 10,
        sortBy: 'orderNumber',
        sortDir: 'asc',
      }),
    );
    expect(prisma.shipment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ order: { number: 'asc' } }, { id: 'asc' }],
        skip: 20,
        take: 10,
      }),
    );
  });

  it('rejects an inverted dispatch range with a validation error', async () => {
    const { service } = setup();
    await expect(
      service.listShipments(
        Object.assign(new AdminShipmentListQueryDto(), {
          dispatchedFrom: '2026-10-01T00:00:00.000Z',
          dispatchedTo: '2026-09-01T00:00:00.000Z',
        }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('raises not found for an absent shipment', async () => {
    const prisma = {
      shipment: {
        findUnique: vi.fn(async () => null),
      },
    };
    const service = new ShipmentReadService(prisma as unknown as PrismaService);
    await expect(service.getShipment('missing')).rejects.toBeInstanceOf(NotFoundException);
  });
});
