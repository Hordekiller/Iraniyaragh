import type { AuthUser } from '@/lib/auth/AuthProvider';

export function canReadSuppliers(user: AuthUser | null): boolean {
  return Boolean(user?.permissions.includes('suppliers.read'));
}

export function canManageSuppliers(user: AuthUser | null): boolean {
  return Boolean(user?.permissions.includes('suppliers.manage'));
}
