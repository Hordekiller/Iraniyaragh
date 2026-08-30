import { Prisma } from '@prisma/client';
import { StockAlertsService } from './stock-alerts.service';

describe('StockAlertsService.subscribe', () => {
  const build = (prismaOverrides: Record<string, unknown> = {}) => {
    const notifications = { notifyStockRestocked: jest.fn() };
    const prisma = {
      sku: { findUnique: jest.fn() },
      stockAlertSubscription: {
        create: jest.fn(),
        findFirst: jest.fn(),
      },
      ...prismaOverrides,
    };
    const service = new StockAlertsService(prisma as never, notifications as never);
    return { service, prisma, notifications };
  };

  it('creates a subscription for a valid sku', async () => {
    const { service, prisma } = build();
    prisma.sku.findUnique.mockResolvedValue({ id: 'sku-1' });
    prisma.stockAlertSubscription.create.mockResolvedValue({
      id: 'sub-1',
      skuId: 'sku-1',
      status: 'ACTIVE',
    });
    const result = await service.subscribe({ userId: 'u1' }, 'sku-1', 'SMS');
    expect(result.subscribed).toBe(true);
    expect(prisma.stockAlertSubscription.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 'u1', skuId: 'sku-1' }),
      }),
    );
  });

  it('is idempotent on re-subscribe (unique constraint replay)', async () => {
    const { service, prisma } = build();
    prisma.sku.findUnique.mockResolvedValue({ id: 'sku-1' });
    const conflict = new Prisma.PrismaClientKnownRequestError('dup', {
      code: 'P2002',
      clientVersion: '6',
    });
    prisma.stockAlertSubscription.create.mockRejectedValue(conflict);
    prisma.stockAlertSubscription.findFirst.mockResolvedValue({
      id: 'sub-existing',
      skuId: 'sku-1',
      status: 'ACTIVE',
    });

    const result = await service.subscribe({ userId: 'u1' }, 'sku-1', 'SMS');

    expect(result).toMatchObject({ id: 'sub-existing', subscribed: true, already: true });
  });

  it('requires an identity (userId or guestToken)', async () => {
    const { service } = build();
    await expect(service.subscribe({ userId: null, guestToken: null }, 'sku-1', 'SMS')).rejects.toThrow();
  });

  it('rejects an unknown sku', async () => {
    const { service, prisma } = build();
    prisma.sku.findUnique.mockResolvedValue(null);
    await expect(service.subscribe({ userId: 'u1' }, 'missing', 'SMS')).rejects.toThrow();
  });
});
