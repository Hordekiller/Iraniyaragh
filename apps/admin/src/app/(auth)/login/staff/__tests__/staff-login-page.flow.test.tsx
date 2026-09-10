import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import StaffLoginPage from '@/app/(auth)/login/staff/page';

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  refresh: vi.fn(),
  establishSession: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(async () => undefined),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }),
}));

vi.mock('@/lib/auth/AuthProvider', () => ({
  useAuth: () => ({
    establishSession: mocks.establishSession,
    signIn: mocks.signIn,
    signOut: mocks.signOut,
    user: null,
    isAuthenticated: false,
  }),
}));

describe('StaffLoginPage full flow (fixture)', () => {
  beforeEach(() => {
    mocks.replace.mockReset();
    mocks.refresh.mockReset();
    mocks.establishSession.mockReset();
    process.env.NEXT_PUBLIC_FIXTURE_AUTH = 'true';
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_FIXTURE_AUTH;
  });

  it('drives password -> totp -> authenticated, clears challenge state, and never touches storage', async () => {
    render(<StaffLoginPage />);

    // password step
    expect(screen.getByRole('button', { name: 'ادامه' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('شناسه کارکن'), {
      target: { value: 'ops@iranyaragh.local' },
    });
    fireEvent.change(screen.getByLabelText('رمز عبور'), {
      target: { value: 'FixtuRe-E2E-Admin!2026' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'ادامه' }));

    // totp step
    const codeField = await screen.findByLabelText('کد تایید شش‌رقمی');
    expect(codeField).toBeInTheDocument();
    fireEvent.change(codeField, { target: { value: '654321' } });
    fireEvent.click(screen.getByRole('button', { name: 'ورود' }));

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/dashboard'));
    await waitFor(() => expect(mocks.establishSession).toHaveBeenCalledTimes(1));

    const [session] = mocks.establishSession.mock.calls[0] as [{
      accessToken: string;
      principal: { userId: string; permissions: string[] };
    }];
    expect(session.accessToken).toMatch(/^fixture-staff-at\./);
    expect(session.principal.userId).toBe('ops@iranyaragh.local');
    expect(session.principal.permissions).toEqual(['admin.dashboard.read']);

    // storage must stay completely untouched by the memory-only slice.
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it('keeps a failed password submit on the password step and leaves storage untouched', async () => {
    render(<StaffLoginPage />);

    fireEvent.change(screen.getByLabelText('شناسه کارکن'), {
      target: { value: 'ops@iranyaragh.local' },
    });
    fireEvent.change(screen.getByLabelText('رمز عبور'), {
      target: { value: 'wrong-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'ادامه' }));

    await screen.findByRole('alert');
    expect(screen.getByRole('alert')).toHaveTextContent('شناسه یا رمز عبور نادرست است');
    expect(screen.getByLabelText('شناسه کارکن')).toBeInTheDocument();
    expect(mocks.establishSession).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it('fails closed and renders no sign-in form when the fixture opt-in is absent', () => {
    delete process.env.NEXT_PUBLIC_FIXTURE_AUTH;
    render(<StaffLoginPage />);

    expect(
      screen.getByRole('alert'),
    ).toHaveTextContent('ورود کارکنان به‌صورت آزمایشی در این نسخه فعال نیست');
    expect(screen.queryByLabelText('شناسه کارکن')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'ادامه' })).not.toBeInTheDocument();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });
});
