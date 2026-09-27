import { describe, expect, it } from 'vitest';
import { canAdjustInventory, canReadInventory } from '../inventory-permissions';

describe('inventory Admin gates', () => {
  it('keeps read and mutation permissions separate', () => {
    expect(canReadInventory(null)).toBe(false);
    expect(canAdjustInventory(null)).toBe(false);
    const principal = { userId: 'u1', sessionId: 's1', authenticationLevel: 'STAFF_MFA', permissions: ['inventory.read'] };
    expect(canReadInventory(principal)).toBe(true);
    expect(canAdjustInventory(principal)).toBe(false);
    expect(canAdjustInventory({ ...principal, permissions: ['inventory.adjust'] })).toBe(true);
    expect(canReadInventory({ ...principal, permissions: ['inventory.adjust'] })).toBe(false);
  });
});
