import type { AuthUser } from '@/lib/auth/AuthProvider';

export const CATALOG_READ = 'catalog.read';
export const CATALOG_WRITE = 'catalog.write';
export const CATALOG_MEDIA_READ = 'catalog.media.read';
export const CATALOG_MEDIA_WRITE = 'catalog.media.write';

export function hasPermission(user: AuthUser | null, permission: string): boolean {
  return Boolean(user?.permissions.includes(permission));
}

export function canReadCatalog(user: AuthUser | null): boolean {
  return hasPermission(user, CATALOG_READ);
}

export function canWriteCatalog(user: AuthUser | null): boolean {
  return hasPermission(user, CATALOG_WRITE);
}

export function canReadCatalogMedia(user: AuthUser | null): boolean {
  return hasPermission(user, CATALOG_MEDIA_READ);
}

export function canWriteCatalogMedia(user: AuthUser | null): boolean {
  return hasPermission(user, CATALOG_MEDIA_WRITE);
}
