import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '@/lib/api/client';
import { inventoryCostPolicy } from './inventory-cost-policy-api';
vi.mock('@/lib/api/client', () => ({ apiFetch: vi.fn() }));
vi.mock('@/lib/auth/token-store', () => ({ getAccessToken: () => 'synthetic-memory-only-token' }));
const empty = { policy: null, valuationEnabled: false, activationGate: 'COST_LEDGER_ACCEPTANCE_REQUIRED', missingCostTreatment: 'REQUIRE_EVIDENCE' };
const submission = { body: { method: 'FIFO' as const, expectedVersion: null, reason: 'آزمون' }, key: 'cost-test-key' };
describe('Inventory cost-policy transport contract', () => {
  beforeEach(() => vi.mocked(apiFetch).mockReset());
  it('reads the real protected contract and accepts an undecided disabled configuration', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ data: empty });
    const signal = new AbortController().signal; expect(await inventoryCostPolicy(signal)).toEqual(empty);
    expect(apiFetch).toHaveBeenCalledWith('/settings/admin/inventory-cost-policy', { token: 'synthetic-memory-only-token', signal, method: 'GET', body: undefined, headers: undefined });
  });
  it('sends the same idempotency key/body and receives an authoritative revision', async () => {
    const data = { ...empty, policy: { id: 'cost-test', version: 1, method: 'FIFO', createdAt: '2026-10-14T00:00:00Z' } };
    vi.mocked(apiFetch).mockResolvedValue({ data });
    const signal = new AbortController().signal; expect(await inventoryCostPolicy(signal, submission)).toEqual(data);
    expect(apiFetch).toHaveBeenCalledWith('/settings/admin/inventory-cost-policy', { token: 'synthetic-memory-only-token', signal, method: 'PUT', body: submission.body, headers: { 'Idempotency-Key': submission.key } });
  });
  it.each([undefined, { ...empty, valuationEnabled: true }, { ...empty, activationGate: 'READY' }, { ...empty, missingCostTreatment: 'ZERO' }])('rejects inconsistent/missing server configuration without success', async data => {
    vi.mocked(apiFetch).mockResolvedValue({ data });
    await expect(inventoryCostPolicy(new AbortController().signal)).rejects.toThrow('could not be verified');
  });
  it('a mutation without a revision remains ambiguous so the UI can retain its original request', async () => {
    vi.mocked(apiFetch).mockResolvedValue({ data: empty });
    await expect(inventoryCostPolicy(new AbortController().signal, submission)).rejects.toThrow('could not be verified');
  });
});
