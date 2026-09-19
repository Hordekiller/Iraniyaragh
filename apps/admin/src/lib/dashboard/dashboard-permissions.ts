import type { AuthUser } from '@/lib/auth/AuthProvider';

export const REPORTS_READ = 'reports.read';

export function canReadDashboard(user: AuthUser | null): boolean {
  return Boolean(user?.permissions.includes(REPORTS_READ));
}
