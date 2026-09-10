import type { AuthUser } from '@/lib/auth/AuthProvider';

export const SETTINGS_MANAGE = 'settings.manage';

export function hasPermission(user: AuthUser | null, permission: string): boolean {
  return Boolean(user?.permissions.includes(permission));
}

export function canManageSettings(user: AuthUser | null): boolean {
  return hasPermission(user, SETTINGS_MANAGE);
}