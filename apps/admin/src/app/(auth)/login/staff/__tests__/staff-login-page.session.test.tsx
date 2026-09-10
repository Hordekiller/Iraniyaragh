import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import StaffLoginPage from '@/app/(auth)/login/staff/page';
import { AuthProvider, useAuth } from '@/lib/auth/AuthProvider';
import { getAccessToken, setAccessToken } from '@/lib/auth/token-store';

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  refresh: vi.fn(),
}));

const storeState = { token: null as string | null, missing: false };

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }),
}));

vi.mock('@/lib/auth/token-store', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth/token-store')>('@/lib/auth/token-store');
  return {
    ...actual,
    createMemoryStaffTokenStore: () => ({
      get: () => (storeState.missing ? null : storeState.token),
      set: (value: string | null) => {
        storeState.token = value;
      },
    }),
  };
});

function SessionProbe() {
  const { isAuthenticated, user } = useAuth();
  return (
    <div>
      <span data-testid="probe-authed">{isAuthenticated ? 'authed' : 'anon'}</span>
      <span data-testid="probe-user">{user?.userId ?? 'none'}</span>
    </div>
  );
}

async function driveSuccessfulLogin(): Promise<void> {
  fireEvent.change(screen.getByLabelText('شناسه کارکن'), {
    target: { value: 'ops@iranyaragh.local' },
  });
  fireEvent.change(screen.getByLabelText('رمز عبور'), {
    target: { value: 'FixtuRe-E2E-Admin!2026' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'ادامه' }));

  const codeField = await screen.findByLabelText('کد تایید شش‌رقمی');
  fireEvent.change(codeField, { target: { value: '654321' } });
  fireEvent.click(screen.getByRole('button', { name: 'ورود' }));
}

describe('StaffLoginPage session bridge (real AuthProvider)', () => {
  beforeEach(() => {
    mocks.replace.mockReset();
    mocks.refresh.mockReset();
    storeState.token = null;
    storeState.missing = false;
    setAccessToken(null);
    process.env.NEXT_PUBLIC_FIXTURE_AUTH = 'true';
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_FIXTURE_AUTH;
    vi.unstubAllGlobals();
  });

  it('commits the adopted session into the provider before navigating to /dashboard', async () => {
    const record: { tokenAtNav: string | null } = { tokenAtNav: null };
    mocks.replace.mockImplementation(() => {
      record.tokenAtNav = getAccessToken();
    });

    render(
      <AuthProvider>
        <StaffLoginPage />
        <SessionProbe />
      </AuthProvider>,
    );

    await driveSuccessfulLogin();

    await waitFor(() => expect(mocks.replace).toHaveBeenCalled());
    expect(mocks.replace.mock.calls[0][0]).toBe('/dashboard');
    expect(record.tokenAtNav).toMatch(/^fixture-staff-at\./);

    await waitFor(() => expect(screen.getByTestId('probe-authed')).toHaveTextContent('authed'));
    expect(screen.getByTestId('probe-user')).toHaveTextContent('ops@iranyaragh.local');

    // Adoption is still memory-only.
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it('fails closed when the access token is missing: no adoption, no redirect, recoverable state', async () => {
    storeState.missing = true;

    render(
      <AuthProvider>
        <StaffLoginPage />
        <SessionProbe />
      </AuthProvider>,
    );

    await driveSuccessfulLogin();

    // Back on the recoverable password step with an explanatory error…
    await waitFor(() => expect(screen.getByLabelText('شناسه کارکن')).toBeInTheDocument());
    expect(screen.getByRole('alert')).toHaveTextContent('نشست تایید نامعتبر است. دوباره وارد شوید.');
    expect(screen.getByRole('button', { name: 'ادامه' })).toBeInTheDocument();

    // …and neither the session nor navigation happened.
    expect(mocks.replace).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByTestId('probe-authed')).toHaveTextContent('anon'));
    expect(screen.getByTestId('probe-user')).toHaveTextContent('none');
    expect(getAccessToken()).toBeNull();

    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });
});