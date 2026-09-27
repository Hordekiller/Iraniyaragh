import type { AuthUser } from '@/lib/auth/AuthProvider';

export function canReadInventory(user: AuthUser | null): boolean {
  return Boolean(user?.permissions.includes('inventory.read'));
}

export function canAdjustInventory(user: AuthUser | null): boolean {
  return Boolean(user?.permissions.includes('inventory.adjust'));
}
