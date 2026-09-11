import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SETTINGS_MANAGE } from '@/lib/settings/settings-permissions';
import { defaultPreferences } from '@/lib/preferences/preferences';
import { SettingsView } from '../SettingsView';

const mocks = vi.hoisted(() => ({
  user: null as { permissions: string[] } | null,
  updatePrefs: vi.fn(),
  resetPrefs: vi.fn(),
}));

vi.mock('@/lib/auth/AuthProvider', () => ({
  useAuth: () => ({ user: mocks.user, isAuthenticated: true, signIn: vi.fn(), signOut: vi.fn() }),
}));

vi.mock('@/lib/preferences/AdminPreferencesProvider', () => ({
  useAdminPreferences: () => ({
    prefs: defaultPreferences,
    resolvedMode: 'light',
    updatePrefs: mocks.updatePrefs,
    resetPrefs: mocks.resetPrefs,
  }),
}));

const manager = { permissions: ['admin.dashboard.read', SETTINGS_MANAGE] };

describe('SettingsView', () => {
  beforeEach(() => {
    mocks.user = manager;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders the page header and all preference groups', () => {
    render(<SettingsView />);

    expect(screen.getByRole('heading', { name: 'تنظیمات پنل' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /بازنشانی پیش‌فرض/ })).toBeInTheDocument();
    expect(screen.getByText('حالت رنگ')).toBeInTheDocument();
    expect(screen.getByText('پوستهٔ کارت‌ها')).toBeInTheDocument();
    expect(screen.getByText('چیدمان')).toBeInTheDocument();
    expect(screen.getByText('عرض محتوا')).toBeInTheDocument();

    expect(screen.getByRole('group', { name: 'حالت رنگ پنل' })).toBeInTheDocument();
  });

  it('applies a preference change through updatePrefs', () => {
    render(<SettingsView />);

    fireEvent.click(screen.getByRole('button', { name: 'تیره' }));

    expect(mocks.updatePrefs).toHaveBeenCalledWith({ mode: 'dark' });
  });

  it('switches the layout choice', () => {
    render(<SettingsView />);

    fireEvent.click(screen.getByRole('button', { name: /افقی/ }));

    expect(mocks.updatePrefs).toHaveBeenCalledWith({ layout: 'horizontal' });
  });

  it('resets preferences on demand', () => {
    render(<SettingsView />);

    fireEvent.click(screen.getByRole('button', { name: /بازنشانی پیش‌فرض/ }));

    expect(mocks.resetPrefs).toHaveBeenCalledTimes(1);
  });

  it('forbids users without settings.manage', () => {
    mocks.user = { permissions: ['admin.dashboard.read'] };
    render(<SettingsView />);

    expect(screen.getByText('دسترسی ندارید')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /بازنشانی پیش‌فرض/ })).not.toBeInTheDocument();
  });
});