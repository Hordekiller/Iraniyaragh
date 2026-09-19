import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDashboardSummary } from '../dashboard-api';

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  getAccessToken: vi.fn(),
}));

vi.mock('@/lib/api/client', () => ({
  apiFetch: mocks.apiFetch,
}));

vi.mock('@/lib/auth/token-store', () => ({
  getAccessToken: mocks.getAccessToken,
}));

describe('getDashboardSummary', () => {
  beforeEach(() => {
    mocks.apiFetch.mockReset();
    mocks.getAccessToken.mockReset();
  });

  it('requests the real dashboard endpoint with explicit encoded boundaries and bearer token', async () => {
    const signal = new AbortController().signal;
    const summary = { generatedAt: '2026-09-19T08:00:00.000Z' };
    mocks.getAccessToken.mockReturnValue('staff-access-token');
    mocks.apiFetch.mockResolvedValue({ data: { summary } });

    await expect(
      getDashboardSummary(
        {
          createdFrom: '2026-09-12T08:00:00.000Z',
          createdToExclusive: '2026-09-19T08:00:00.000Z',
        },
        signal,
      ),
    ).resolves.toBe(summary);

    expect(mocks.apiFetch).toHaveBeenCalledWith(
      '/reports/admin/dashboard?createdFrom=2026-09-12T08%3A00%3A00.000Z&createdToExclusive=2026-09-19T08%3A00%3A00.000Z',
      { token: 'staff-access-token', signal },
    );
  });
});
