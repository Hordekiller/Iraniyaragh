import { describe, expect, it } from 'vitest';
import type { AuthUser } from '@/lib/auth/AuthProvider';
import { canReadDashboard, REPORTS_READ } from '../dashboard-permissions';

function user(permissions: string[]): AuthUser {
  return {
    userId: 'staff-1',
    sessionId: 'session-1',
    authenticationLevel: 'STAFF_MFA',
    permissions,
  };
}

describe('dashboard-permissions', () => {
  it('requires the canonical reports.read permission', () => {
    expect(canReadDashboard(user([REPORTS_READ]))).toBe(true);
    expect(canReadDashboard(user(['admin.dashboard.read']))).toBe(false);
    expect(canReadDashboard(user([]))).toBe(false);
    expect(canReadDashboard(null)).toBe(false);
  });
});
