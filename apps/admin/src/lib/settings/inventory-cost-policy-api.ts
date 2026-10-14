import type { InventoryCostPolicyResponse, InventoryCostPolicyUpdate } from '@iranyaragh/contracts';
import { apiFetch } from '@/lib/api/client';
import { getAccessToken } from '@/lib/auth/token-store';
export async function inventoryCostPolicy(signal: AbortSignal, mutation?: { body: InventoryCostPolicyUpdate; key: string }) {
  const data = (await apiFetch<InventoryCostPolicyResponse['data']>('/settings/admin/inventory-cost-policy', {
    token: getAccessToken(), signal, method: mutation ? 'PUT' : 'GET', body: mutation?.body,
    headers: mutation ? { 'Idempotency-Key': mutation.key } : undefined,
  })).data;
  if (!data || data.valuationEnabled !== false || data.activationGate !== 'COST_LEDGER_ACCEPTANCE_REQUIRED' ||
    data.missingCostTreatment !== 'REQUIRE_EVIDENCE' || (mutation && !data.policy))
    throw new Error('Inventory cost configuration response could not be verified.');
  return data;
}
