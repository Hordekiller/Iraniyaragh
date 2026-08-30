import { NotificationsService } from './notifications.service';
import { DevSmsSender } from './sms-sender';

type MockPrisma = {
  stockAlertSubscription: {
    findMany: jest.Mock;
    updateMany: jest.Mock;
  };
};

function build() {
  const sms = new DevSmsSender();
  const sendSpy = jest.spyOn(sms, 'send').mockResolvedValue(undefined);
  const prisma: MockPrisma = {
    stockAlertSubscription: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
  };
  const service = new NotificationsService(prisma as unknown as never, sms);
  return { service, prisma, sendSpy };
}

describe('NotificationsService.notifyStockRestocked', () => {
  it('notifies each claimed subscriber', async () => {
    const { service, prisma, sendSpy } = build();
    prisma.stockAlertSubscription.findMany.mockResolvedValue([
      { id: 's1', user: { mobile: '+989120000001' } },
      { id: 's2', user: { mobile: '+989120000002' } },
    ]);
    prisma.stockAlertSubscription.updateMany.mockResolvedValue({ count: 1 });

    const notified = await service.notifyStockRestocked('sku-1', 'SKU-1');

    expect(notified).toBe(2);
    expect(sendSpy).toHaveBeenCalledTimes(2);
    expect(sendSpy).toHaveBeenCalledWith(
      expect.objectContaining({ to: '+989120000001', params: { sku: 'SKU-1' } }),
    );
  });

  it('skips subscribers with no claimable mobile', async () => {
    const { service, prisma, sendSpy } = build();
    prisma.stockAlertSubscription.findMany.mockResolvedValue([{ id: 's1', user: null }]);
    const notified = await service.notifyStockRestocked('sku-1', 'SKU-1');
    expect(notified).toBe(0);
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it('does not double-notify when the claim is lost to concurrency', async () => {
    const { service, prisma, sendSpy } = build();
    prisma.stockAlertSubscription.findMany.mockResolvedValue([
      { id: 's1', user: { mobile: '+989120000001' } },
    ]);
    // Guarded updateMany claims 0 rows -> already notified by a concurrent call.
    prisma.stockAlertSubscription.updateMany.mockResolvedValue({ count: 0 });

    const notified = await service.notifyStockRestocked('sku-1', 'SKU-1');

    expect(notified).toBe(0);
    expect(sendSpy).not.toHaveBeenCalled();
    expect(prisma.stockAlertSubscription.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 's1', status: 'ACTIVE', notifiedAt: null }),
      }),
    );
  });
});
