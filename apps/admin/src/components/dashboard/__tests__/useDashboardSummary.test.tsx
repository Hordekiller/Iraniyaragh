import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError, ApiNetworkError } from '@/lib/api/client';
import {
  createDashboardRange,
  normalizeDashboardError,
  useDashboardSummary,
} from '../useDashboardSummary';

const mocks = vi.hoisted(() => ({ getSummary: vi.fn() }));

vi.mock('@/lib/dashboard/dashboard-api', () => ({
  dashboardApi: { getSummary: mocks.getSummary },
}));

const summary = {
  generatedAt: '2026-09-19T08:00:00.000Z',
  presentationTimezone: 'Asia/Tehran' as const,
  range: {
    createdFrom: '2026-09-12T08:00:00.000Z',
    createdToExclusive: '2026-09-19T08:00:00.000Z',
  },
  rangeMetrics: { ordersCreated: 0, grossOrderValue: { amount: '0', currency: 'IRR' as const } },
  commerceSnapshot: {
    ordersByStatus: [],
    paymentAttemptsByStatus: [],
    fulfillmentsByStatus: [],
    ordersWithoutPaymentAttempts: 0,
    ordersWithoutFulfillment: 0,
  },
  inventorySnapshot: {
    zeroAvailableBalances: 0,
    activeReservations: 0,
    reservationsByStatus: [],
    transfersByStatus: [],
  },
};

describe('useDashboardSummary', () => {
  beforeEach(() => mocks.getSummary.mockReset());

  it('builds exact rolling UTC boundaries', () => {
    expect(createDashboardRange(7, Date.parse('2026-09-19T08:00:00.000Z'))).toEqual({
      createdFrom: '2026-09-12T08:00:00.000Z',
      createdToExclusive: '2026-09-19T08:00:00.000Z',
    });
  });

  it('does not request protected data while the permission gate is disabled', () => {
    const { result } = renderHook(() => useDashboardSummary(7, false));
    expect(result.current).toMatchObject({ summary: null, loading: false, error: null });
    expect(mocks.getSummary).not.toHaveBeenCalled();
  });

  it('loads the server summary and supports an explicit refresh', async () => {
    mocks.getSummary.mockResolvedValue(summary);
    const { result } = renderHook(() => useDashboardSummary(7));

    await waitFor(() => expect(result.current.summary).toBe(summary));
    expect(mocks.getSummary).toHaveBeenCalledTimes(1);

    act(() => result.current.refresh());
    await waitFor(() => expect(mocks.getSummary).toHaveBeenCalledTimes(2));
  });

  it.each([
    [new ApiClientError({ code: 'FORBIDDEN', message: 'no', requestId: 'req-403', statusCode: 403 }), 'forbidden'],
    [new ApiClientError({ code: 'AUTH_SESSION_INVALID', message: 'no', requestId: 'req-401', statusCode: 401 }), 'unauthorized'],
    [new ApiNetworkError('offline'), 'network'],
    [new Error('unexpected'), 'request'],
  ] as const)('normalizes load failure %#', (failure, kind) => {
    expect(normalizeDashboardError(failure).kind).toBe(kind);
  });

  it('aborts in-flight work on unmount', () => {
    mocks.getSummary.mockResolvedValue(summary);
    const { unmount } = renderHook(() => useDashboardSummary(7));
    const receivedSignal = mocks.getSummary.mock.calls[0]?.[1] as AbortSignal | undefined;
    unmount();
    expect(receivedSignal?.aborted).toBe(true);
  });
});
