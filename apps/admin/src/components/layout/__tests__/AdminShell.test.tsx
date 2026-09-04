import { render, screen, fireEvent, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminShell } from '../AdminShell';

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  refresh: vi.fn(),
  signOut: vi.fn(async () => undefined),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }),
}));

vi.mock('@/lib/auth/AuthProvider', () => ({
  useAuth: () => ({
    user: { userId: 'dev-admin', sessionId: 's-1', authenticationLevel: 'STAFF_MFA', permissions: ['catalog.read'] },
    isAuthenticated: true,
    signIn: vi.fn(),
    signOut: mocks.signOut,
  }),
}));

describe('AdminShell', () => {
  afterEach(() => {
    mocks.replace.mockReset();
    mocks.refresh.mockReset();
    mocks.signOut.mockReset();
  });

  it('renders the authenticated sidebar and dashboard link', () => {
    render(
      <AdminShell>
        <div>content</div>
      </AdminShell>,
    );

    const sidebar = screen.getByRole('complementary', { name: 'منوی اصلی' });
    expect(sidebar).toBeInTheDocument();
    expect(within(sidebar).getByRole('link', { name: /داشبورد/ })).toBeVisible();
    expect(screen.getByRole('main')).toHaveTextContent('content');
  });

  it('renders the developer profile, version and disabled notification', () => {
    render(
      <AdminShell>
        <div>content</div>
      </AdminShell>,
    );

    expect(screen.getByText('مدیر سیستم')).toBeInTheDocument();
    expect(screen.getByText('حساب آزمایشی')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /اعلان‌ها/ })).toBeDisabled();
    expect(screen.getByText('نسخهٔ پایه')).toBeInTheDocument();
    expect(screen.getByText('v0.1.0')).toBeInTheDocument();
  });

  it('closes the session and redirects to /login on sign-out', async () => {
    render(
      <AdminShell>
        <div>content</div>
      </AdminShell>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'خروج از حساب' }));
    await Promise.resolve();

    expect(mocks.signOut).toHaveBeenCalledTimes(1);
    expect(mocks.replace).toHaveBeenCalledWith('/login');
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it('opens the drawer, focuses the close button and closes on Escape', () => {
    render(
      <AdminShell>
        <div>content</div>
      </AdminShell>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'باز کردن منو' }));

    const dialog = screen.getByRole('dialog', { name: 'منوی اصلی' });
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: /داشبورد/ })).toBeInTheDocument();

    expect(document.body.style.overflow).toBe('hidden');
    expect(document.activeElement).toHaveAttribute('aria-label', 'بستن منو');

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'منوی اصلی' })).not.toBeInTheDocument();
    expect(document.body.style.overflow).not.toBe('hidden');
  });
});
