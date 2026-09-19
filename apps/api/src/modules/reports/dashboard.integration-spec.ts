import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../database/prisma.service';
import { assertIsolatedTestDatabase } from '../../test/database-url.guard';
import { DashboardService } from './dashboard.service';

describe.sequential('DashboardService database integration', () => {
  const prisma = new PrismaService();
  const dashboard = new DashboardService(prisma);
  let connected = false;

  beforeAll(async () => {
    assertIsolatedTestDatabase({
      databaseUrl: process.env.DATABASE_URL,
      nodeEnvironment: process.env.NODE_ENV,
    });
    await prisma.$connect();
    connected = true;
  });

  afterAll(async () => {
    if (connected) await prisma.$disconnect();
  });

  it('executes the production aggregate query plan against the migrated schema', async () => {
    const response = await dashboard.getSummary({
      createdFrom: '2026-09-01T00:00:00.000Z',
      createdToExclusive: '2026-09-08T00:00:00.000Z',
    });
    const summary = response.data.summary;

    expect(summary.presentationTimezone).toBe('Asia/Tehran');
    expect(summary.rangeMetrics.ordersCreated).toBeGreaterThanOrEqual(0);
    expect(summary.rangeMetrics.grossOrderValue).toMatchObject({
      currency: 'IRR',
      amount: expect.stringMatching(/^\d+$/),
    });
    expect(summary.commerceSnapshot.ordersByStatus).toHaveLength(5);
    expect(summary.commerceSnapshot.paymentAttemptsByStatus).toHaveLength(6);
    expect(summary.commerceSnapshot.fulfillmentsByStatus).toHaveLength(7);
    expect(summary.inventorySnapshot.reservationsByStatus).toHaveLength(4);
    expect(summary.inventorySnapshot.transfersByStatus).toHaveLength(6);

    const serialized = JSON.stringify(response).toLowerCase();
    for (const forbidden of [
      'mobile',
      'email',
      'address',
      'authority',
      'idempotencykey',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});
