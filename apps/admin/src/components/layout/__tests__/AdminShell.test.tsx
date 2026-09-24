import { render, screen, fireEvent, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminShell } from '../AdminShell';
import { AdminPreferencesProvider } from '@/lib/preferences/AdminPreferencesProvider';
import {
  defaultPreferences,
  type AdminPreferences,
} from '@/lib/preferences/preferences';

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  refresh: vi.fn(),
  push: vi.fn(),
  signOut: vi.fn(async () => undefined),
  auth: {
    isAuthenticated: true,
    user: {
      userId: 'dev-admin',
      sessionId: 's-1',
      authenticationLevel: 'STAFF_MFA',
      permissions: ['catalog.read', 'reports.read'],
    } as {
      userId: string;
      sessionId: string;
      authenticationLevel: string;
      permissions: string[];
    } | null,
  },
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useRouter: () => ({
    replace: mocks.replace,
    refresh: mocks.refresh,
    push: mocks.push,
  }),
}));

vi.mock('@/lib/auth/AuthProvider', () => ({
  useAuth: () => ({
    user: mocks.auth.user,
    isAuthenticated: mocks.auth.isAuthenticated,
    signIn: vi.fn(),
    signOut: mocks.signOut,
  }),
}));

function renderShell(
  prefs: Partial<AdminPreferences> = {},
  children = <div>content</div>,
) {
  return render(
    <AdminPreferencesProvider
      initialPrefs={{ ...defaultPreferences, ...prefs }}
    >
      <AdminShell>{children}</AdminShell>
    </AdminPreferencesProvider>,
  );
}

describe('AdminShell', () => {
  afterEach(() => {
    mocks.replace.mockReset();
    mocks.refresh.mockReset();
    mocks.push.mockReset();
    mocks.signOut.mockReset();
    mocks.auth.isAuthenticated = true;
    mocks.auth.user = {
      userId: 'dev-admin',
      sessionId: 's-1',
      authenticationLevel: 'STAFF_MFA',
      permissions: ['catalog.read', 'reports.read'],
    };
  });

  it('renders an accessible redirect state instead of a blank page without a session', () => {
    mocks.auth.isAuthenticated = false;
    mocks.auth.user = null;

    renderShell();

    expect(
      screen.getByRole('heading', { name: 'نشست فعال یافت نشد' }),
    ).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent(
      'لطفاً چند لحظه منتظر بمانید',
    );
    expect(mocks.replace).toHaveBeenCalledWith('/login');
  });

  it('renders the authenticated sidebar and dashboard link', () => {
    renderShell();

    const sidebar = screen.getByRole('complementary', { name: 'منوی اصلی' });
    expect(sidebar).toBeInTheDocument();
    expect(
      within(sidebar).getByRole('link', { name: /داشبورد/ }),
    ).toBeVisible();
    expect(screen.getByRole('main')).toHaveTextContent('content');
  });

  it('renders the global search trigger and an enabled notifications bell', () => {
    renderShell();

    expect(
      screen.getByRole('button', { name: 'جستجوی سریع در پنل' }),
    ).toBeInTheDocument();
    const bell = screen.getByRole('button', { name: /اعلان‌ها/ });
    expect(bell).toBeEnabled();
    expect(screen.getByText('نسخهٔ پایه')).toBeInTheDocument();
    expect(screen.getByText('v0.1.0')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'شخصی‌سازی ظاهر پنل' }),
    ).toBeInTheDocument();
  });

  it('opens an honest empty notifications state without runtime fixtures', () => {
    renderShell();

    fireEvent.click(screen.getByRole('button', { name: /اعلان‌ها/ }));
    expect(
      screen.getByText('جریان اعلان متصل نیست').closest('[role="status"]'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/مشتری نمونه/)).not.toBeInTheDocument();
  });

  it('signs out from the profile menu and redirects to /login', async () => {
    renderShell();

    fireEvent.click(screen.getByRole('button', { name: 'منوی حساب کاربری' }));
    expect(screen.getByText('کاربر کارکنان')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('menuitem', { name: /خروج از حساب/ }));
    await Promise.resolve();

    expect(mocks.signOut).toHaveBeenCalledTimes(1);
    expect(mocks.replace).toHaveBeenCalledWith('/login');
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it('toggles the collapsed (mini) sidebar on desktop', () => {
    renderShell();

    const toggle = screen.getByRole('button', { name: 'جمع کردن نوار کناری' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(toggle);
    expect(
      screen.getByRole('button', { name: 'باز کردن نوار کناری' }),
    ).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(
      screen.getByRole('button', { name: 'باز کردن نوار کناری' }),
    );
    expect(
      screen.getByRole('button', { name: 'جمع کردن نوار کناری' }),
    ).toHaveAttribute('aria-pressed', 'false');
  });

  it('opens the Vuexy-inspired customizer and updates layout preferences', () => {
    renderShell();
    fireEvent.click(screen.getByRole('button', { name: 'شخصی‌سازی ظاهر پنل' }));
    expect(
      screen.getByRole('heading', { name: 'شخصی‌سازی پنل' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: 'منوی افقی' }));
    fireEvent.click(screen.getByRole('button', { name: 'بستن شخصی‌سازی' }));
    expect(
      screen.getByRole('navigation', { name: 'ناوبری افقی' }),
    ).toBeInTheDocument();
  });

  it('shows only navigation entries allowed by the principal permissions', () => {
    renderShell();
    expect(screen.getByText('کالا و SKU')).toBeInTheDocument();
    expect(screen.queryByText('پرداخت‌ها')).not.toBeInTheDocument();
    expect(screen.queryByText('گزارش ممیزی')).not.toBeInTheDocument();
  });

  it('provides a keyboard skip link to the main content', () => {
    renderShell();
    expect(
      screen.getByRole('link', { name: 'پرش به محتوای اصلی' }),
    ).toHaveAttribute('href', '#admin-main-content');
    expect(screen.getByRole('main')).toHaveAttribute(
      'id',
      'admin-main-content',
    );
  });

  it('marks the active route and exposes a polite route announcement', () => {
    renderShell();

    expect(screen.getByRole('link', { name: /داشبورد/ })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
  });

  it('renders a horizontal nav bar instead of a sidebar for the horizontal layout', () => {
    renderShell({ layout: 'horizontal' });

    const navBar = screen.getByRole('navigation', { name: 'ناوبری افقی' });
    expect(
      within(navBar).getByRole('link', { name: /داشبورد/ }),
    ).toBeInTheDocument();
  });

  it('renders the collapse toggle only in vertical layout', () => {
    renderShell({ layout: 'horizontal' });
    expect(
      screen.queryByRole('button', { name: 'جمع کردن نوار کناری' }),
    ).not.toBeInTheDocument();
  });

  it('opens the drawer, focuses the close button and closes on Escape', () => {
    renderShell();

    fireEvent.click(screen.getByRole('button', { name: 'باز کردن منو' }));

    const dialog = screen.getByRole('dialog', { name: 'منوی اصلی' });
    expect(dialog).toBeInTheDocument();
    expect(
      within(dialog).getByRole('link', { name: /داشبورد/ }),
    ).toBeInTheDocument();

    expect(document.body.style.overflow).toBe('hidden');
    expect(document.activeElement).toHaveAttribute('aria-label', 'بستن منو');

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(
      screen.queryByRole('dialog', { name: 'منوی اصلی' }),
    ).not.toBeInTheDocument();
    expect(document.body.style.overflow).not.toBe('hidden');
  });
});
