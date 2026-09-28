import type { AuthUser } from '@/lib/auth/AuthProvider';

export function canReadInventory(user: AuthUser | null): boolean {
  return Boolean(user?.permissions.includes('inventory.read'));
}

export function canAdjustInventory(user: AuthUser | null): boolean {
  return Boolean(user?.permissions.includes('inventory.adjust'));
}

export function canTransferInventory(user: AuthUser | null): boolean {
  return Boolean(user?.permissions.includes('inventory.transfer'));
}

export function canApproveInventory(user: AuthUser | null): boolean {
  return Boolean(user?.permissions.includes('inventory.approve'));
}
