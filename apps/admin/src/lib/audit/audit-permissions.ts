import type { AuthUser } from '@/lib/auth/AuthProvider';

export function canReadAuditLogs(user: AuthUser | null): boolean {
  return Boolean(user?.permissions.includes('audit.read'));
}