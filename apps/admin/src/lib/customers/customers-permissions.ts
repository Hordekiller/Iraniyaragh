import type { AuthUser } from '@/lib/auth/AuthProvider';

export const CUSTOMERS_READ = 'customers.read';
export const CUSTOMERS_MANAGE = 'customers.manage';

export function canReadCustomers(user: AuthUser | null): boolean {
  return Boolean(user?.permissions.includes(CUSTOMERS_READ));
}

export function canManageCustomers(user: AuthUser | null): boolean {
  return Boolean(user?.permissions.includes(CUSTOMERS_MANAGE));
}
