import type { AuthUser } from '@/lib/auth/AuthProvider';

export const SHIPMENTS_READ = 'shipments.read';
export const SHIPMENTS_MANAGE = 'shipments.manage';

export function canReadShipments(user: AuthUser | null): boolean {
  return Boolean(user?.permissions.includes(SHIPMENTS_READ));
}
