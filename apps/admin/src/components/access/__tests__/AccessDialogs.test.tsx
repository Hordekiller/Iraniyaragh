import { useState } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccessPermission, AccessRoleDetail, AccessRoleMember } from '@iranyaragh/contracts';
import * as api from '@/lib/access/access-api';
import type { AuthUser } from '@/lib/auth/AuthProvider';
import { PermissionPicker } from '../PermissionPicker';
import { PermissionsDialog } from '../PermissionsDialog';
import { RevokeMemberDialog } from '../RevokeMemberDialog';

vi.mock('@/lib/access/access-api', async (importOriginal) => ({
  ...(await importOriginal<typeof api>()),
  replaceAccessPermissions: vi.fn(),
  revokeAccessMember: vi.fn(),
}));

const permission = (key: string, group: string, name: string, isActive = true): AccessPermission => ({ key, group, name, description: 'd', isActive });
const permissions = [
  permission('custom.alpha', 'custom', 'Alpha'),
  permission('custom.beta', 'custom', 'Beta'),
  permission('other.gamma', 'other', 'Gamma'),
  permission('other.retired', 'other', 'Retired', false),
];
const role: AccessRoleDetail = {
  id: 'r1', key: 'operators', name: 'اپراتور', description: null, isSystem: false, isActive: true, version: 7,
  permissionKeys: ['custom.alpha'], memberCount: 1, activeMemberCount: 1,
  createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z',
  permissions: [], members: [],
};
const member: AccessRoleMember = { userId: 'u1', displayName: 'علی', mobileMasked: '0912***4567', emailMasked: null, status: 'ACTIVE', assignedAt: '2026-11-01T00:00:00.000Z', expiresAt: null, assignmentExpired: false };
const user = { permissions: ['custom.alpha', 'custom.beta'] } as unknown as AuthUser;

function Picker({ initial = [], actor = ['custom.alpha', 'custom.beta'], locked, disabled, spy }: { initial?: string[]; actor?: string[]; locked?: string[]; disabled?: boolean; spy?: (next: Set<string>) => void }) {
  const [selected, setSelected] = useState(new Set(initial));
  return (
    <PermissionPicker
      permissions={permissions}
      selected={selected}
      onChange={(next) => { spy?.(next); setSelected(next); }}
      actorPermissionKeys={new Set(actor)}
      lockedKeys={locked ? new Set(locked) : undefined}
      disabled={disabled}
    />
  );
}
const box = (key: string) => within(screen.getByText(new RegExp(`^${key.replace('.', '\\.')}`)).closest('label') as HTMLElement).getByRole('checkbox');

describe('PermissionPicker', () => {
  it('hides inactive permissions unless they are already selected', () => {
    const { unmount } = render(<Picker />);
    expect(screen.queryByText(/^other\.retired/)).not.toBeInTheDocument();
    unmount();
    render(<Picker initial={['other.retired']} />);
    expect(screen.getByText(/^other\.retired/)).toBeInTheDocument();
  });

  it('never lets the actor grant a permission they do not hold', () => {
    render(<Picker />);
    expect(box('other.gamma')).toBeDisabled();
    expect(screen.getByText(/other\.gamma — خارج از دسترسی شما/)).toBeInTheDocument();
  });

  it('toggles a grantable permission', () => {
    const spy = vi.fn();
    render(<Picker spy={spy} />);
    fireEvent.click(box('custom.alpha'));
    expect([...spy.mock.calls[0]![0]]).toEqual(['custom.alpha']);
    expect(box('custom.alpha')).toBeChecked();
  });

  it('keeps a locked permission selected, individually and through select-none', () => {
    render(<Picker initial={['custom.alpha', 'custom.beta']} locked={['custom.alpha']} />);
    expect(box('custom.alpha')).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'برداشتن همه' }));
    expect(box('custom.alpha')).toBeChecked();
    expect(box('custom.beta')).not.toBeChecked();
  });

  it('select-all adds only what the actor holds', () => {
    const spy = vi.fn();
    render(<Picker actor={['custom.alpha']} spy={spy} />);
    fireEvent.click(screen.getByRole('button', { name: 'انتخاب همه' }));
    expect([...spy.mock.calls[0]![0]]).toEqual(['custom.alpha']);
  });

  it('filters by search and reports no match', () => {
    render(<Picker />);
    const search = screen.getByRole('textbox', { name: 'جستجوی دسترسی' });
    fireEvent.change(search, { target: { value: 'gamma' } });
    expect(screen.getByText(/^other\.gamma/)).toBeInTheDocument();
    expect(screen.queryByText(/^custom\.alpha/)).not.toBeInTheDocument();
    fireEvent.change(search, { target: { value: 'nothing-matches' } });
    expect(screen.getByText('دسترسی‌ای مطابق جستجو یافت نشد.')).toBeInTheDocument();
  });

  it('offers no group action and no change while disabled', () => {
    render(<Picker disabled />);
    expect(screen.queryByRole('button', { name: 'انتخاب همه' })).not.toBeInTheDocument();
    expect(box('custom.alpha')).toBeDisabled();
  });
});

describe('PermissionsDialog', () => {
  beforeEach(() => {
    vi.mocked(api.replaceAccessPermissions).mockReset();
  });

  it('sends the selection with the version it was read at', async () => {
    const updated = { ...role, version: 8 };
    vi.mocked(api.replaceAccessPermissions).mockResolvedValue(updated);
    const onSaved = vi.fn();
    const onClose = vi.fn();
    render(<PermissionsDialog open role={role} permissions={permissions} user={user} onClose={onClose} onSaved={onSaved} />);
    fireEvent.click(box('custom.beta'));
    fireEvent.click(screen.getByRole('button', { name: 'ذخیرهٔ دسترسی‌ها' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(updated));
    expect(api.replaceAccessPermissions).toHaveBeenCalledWith('r1', { expectedVersion: 7, permissionKeys: ['custom.alpha', 'custom.beta'] }, expect.any(String));
    expect(onClose).toHaveBeenCalled();
  });

  it('stays open with an error when saving fails', async () => {
    vi.mocked(api.replaceAccessPermissions).mockRejectedValue(new Error('boom'));
    const onSaved = vi.fn();
    const onClose = vi.fn();
    render(<PermissionsDialog open role={role} permissions={permissions} user={user} onClose={onClose} onSaved={onSaved} />);
    fireEvent.click(screen.getByRole('button', { name: 'ذخیرهٔ دسترسی‌ها' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('locks roles.manage on the system-admin role', () => {
    const adminRole = { ...role, key: 'system-admin', permissionKeys: ['custom.rolesmanage', 'roles.manage'] };
    render(<PermissionsDialog open role={adminRole} permissions={[...permissions, permission('roles.manage', 'custom', 'Manage')]} user={{ permissions: ['roles.manage'] } as unknown as AuthUser} onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(box('roles.manage')).toBeDisabled();
    expect(box('roles.manage')).toBeChecked();
  });
});

describe('RevokeMemberDialog', () => {
  beforeEach(() => {
    vi.mocked(api.revokeAccessMember).mockReset();
  });

  it('revokes with a trimmed reason and the role version', async () => {
    vi.mocked(api.revokeAccessMember).mockResolvedValue(role);
    const onSaved = vi.fn();
    const onClose = vi.fn();
    render(<RevokeMemberDialog open role={role} member={member} onClose={onClose} onSaved={onSaved} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'دلیل (اختیاری)' }), { target: { value: '  پایان همکاری ' } });
    fireEvent.click(screen.getByRole('button', { name: 'حذف دسترسی' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(role));
    expect(api.revokeAccessMember).toHaveBeenCalledWith('r1', 'u1', { expectedVersion: 7, reason: 'پایان همکاری' }, expect.any(String));
    expect(onClose).toHaveBeenCalled();
  });

  it('sends a null reason when left empty', async () => {
    vi.mocked(api.revokeAccessMember).mockResolvedValue(role);
    const onSaved = vi.fn();
    render(<RevokeMemberDialog open role={role} member={member} onClose={vi.fn()} onSaved={onSaved} />);
    fireEvent.click(screen.getByRole('button', { name: 'حذف دسترسی' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(api.revokeAccessMember).toHaveBeenCalledWith('r1', 'u1', { expectedVersion: 7, reason: null }, expect.any(String));
  });

  it('does not report success when the revoke fails', async () => {
    vi.mocked(api.revokeAccessMember).mockRejectedValue(new Error('boom'));
    const onSaved = vi.fn();
    const onClose = vi.fn();
    render(<RevokeMemberDialog open role={role} member={member} onClose={onClose} onSaved={onSaved} />);
    fireEvent.click(screen.getByRole('button', { name: 'حذف دسترسی' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
