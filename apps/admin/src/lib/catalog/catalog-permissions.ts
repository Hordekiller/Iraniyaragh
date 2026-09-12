import type { AuthUser } from '@/lib/auth/AuthProvider';

export const CATALOG_READ = 'catalog.read';
export const CATALOG_WRITE = 'catalog.write';

export function hasPermission(user: AuthUser | null, permission: string): boolean {
  return Boolean(user?.permissions.includes(permission));
}

export function canReadCatalog(user: AuthUser | null): boolean {
  return hasPermission(user, CATALOG_READ);
}

export function canWriteCatalog(user: AuthUser | null): boolean {
  return hasPermission(user, CATALOG_WRITE);
}