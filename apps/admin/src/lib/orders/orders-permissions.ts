import type { AuthUser } from '@/lib/auth/AuthProvider';

export const ORDERS_READ = 'orders.read';

export function hasOrderPermission(user: AuthUser | null, permission: string): boolean {
  return Boolean(user?.permissions.includes(permission));
}

export function canReadOrders(user: AuthUser | null): boolean {
  return hasOrderPermission(user, ORDERS_READ);
}
