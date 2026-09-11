import { describe, expect, it } from 'vitest';
import { canManageSettings, hasPermission, SETTINGS_MANAGE } from '../settings-permissions';
import type { AuthUser } from '@/lib/auth/AuthProvider';

const manager: AuthUser = {
  userId: 'u1',
  sessionId: 's1',
  authenticationLevel: 'staff',
  permissions: ['admin.dashboard.read', SETTINGS_MANAGE],
};

const reader: AuthUser = {
  userId: 'u2',
  sessionId: 's2',
  authenticationLevel: 'staff',
  permissions: ['admin.dashboard.read'],
};

describe('settings-permissions', () => {
  it('checks membership generically', () => {
    expect(hasPermission(manager, SETTINGS_MANAGE)).toBe(true);
    expect(hasPermission(reader, SETTINGS_MANAGE)).toBe(false);
    expect(hasPermission(null, SETTINGS_MANAGE)).toBe(false);
  });

  it('grants management only to users holding settings.manage', () => {
    expect(canManageSettings(manager)).toBe(true);
    expect(canManageSettings(reader)).toBe(false);
    expect(canManageSettings(null)).toBe(false);
  });
});