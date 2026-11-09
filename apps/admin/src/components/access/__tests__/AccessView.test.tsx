import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccessRoleDetail } from '@iranyaragh/contracts';
import { AccessView } from '../AccessView';
import * as api from '@/lib/access/access-api';

const auth = vi.hoisted(() => ({ permissions: ['roles.manage'] as string[] }));
vi.mock('@/lib/auth/AuthProvider', () => ({ useAuth: () => ({ user: { userId: 'staff-1', permissions: auth.permissions } }) }));
vi.mock('@/lib/access/access-api', async (importOriginal) => ({
  ...(await importOriginal<typeof api>()),
  listAccessRoles: vi.fn(),
  listAccessPermissions: vi.fn(),
  getAccessRole: vi.fn(),
  listAccessRoleHistory: vi.fn(),
}));

const role: AccessRoleDetail = {
  id: 'r1', key: 'system-admin', name: 'مدیر سیستم', description: null, isSystem: true, isActive: true, version: 3,
  permissionKeys: ['roles.manage'], memberCount: 1, activeMemberCount: 1,
  createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z',
  permissions: [{ key: 'roles.manage', name: 'Manage roles', description: 'd', group: 'roles', isActive: true }],
  members: [{ userId: 'u1', displayName: 'علی رضایی', mobileMasked: '0912***4567', emailMasked: null, status: 'ACTIVE', assignedAt: '2026-11-01T00:00:00.000Z', expiresAt: null, assignmentExpired: false }],
};

describe('AccessView', () => {
  beforeEach(() => {
    auth.permissions = ['roles.manage'];
    vi.mocked(api.listAccessRoles).mockReset().mockResolvedValue({ items: [role] });
    vi.mocked(api.listAccessPermissions).mockReset().mockResolvedValue({ items: role.permissions });
    vi.mocked(api.getAccessRole).mockReset().mockResolvedValue(role);
    vi.mocked(api.listAccessRoleHistory).mockReset().mockResolvedValue({ items: [], total: 0 });
  });

  it('shows a denial and calls no API without the roles.manage permission', async () => {
    auth.permissions = ['orders.read'];
    render(<AccessView />);
    expect(await screen.findByText('دسترسی ندارید')).toBeInTheDocument();
    expect(api.listAccessRoles).not.toHaveBeenCalled();
    expect(api.listAccessPermissions).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'نقش جدید' })).not.toBeInTheDocument();
  });

  it('lists real roles and shows members only with masked contact data', async () => {
    render(<AccessView />);
    expect((await screen.findAllByText('مدیر سیستم')).length).toBeGreaterThan(0);
    expect(await screen.findByText('علی رضایی')).toBeInTheDocument();
    expect(screen.queryByText(/09123334567/)).not.toBeInTheDocument();
    expect(api.getAccessRole).toHaveBeenCalledWith('r1', expect.anything());
  });

  it('reports a failed load instead of showing an empty success state', async () => {
    vi.mocked(api.listAccessRoles).mockRejectedValue(new Error('boom'));
    render(<AccessView />);
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.queryByText('مدیر سیستم')).not.toBeInTheDocument();
  });
});
