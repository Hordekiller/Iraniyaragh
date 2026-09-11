import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionManagementFixture } from '@/lib/auth/session-fixture';
import {
  resetSessionFixtureForTests,
  setSessionServiceOverrideForTests,
} from '@/lib/auth/session-guard';
import { SessionManagementPage } from '../SessionManagementPage';

const { signOutMock } = vi.hoisted(() => ({ signOutMock: vi.fn() }));

vi.mock('@/lib/auth/AuthProvider', () => ({
  useAuth: () => ({ signOut: signOutMock }),
}));

describe('SessionManagementPage', () => {
  beforeEach(() => {
    signOutMock.mockReset();
    setSessionServiceOverrideForTests(SessionManagementFixture.create());
  });

  afterEach(() => {
    resetSessionFixtureForTests();
    cleanup();
  });

  it('loads and renders the fixture sessions with the current device flagged', async () => {
    render(<SessionManagementPage />);

    expect(await screen.findByText('لپ‌تاپ عملیات')).toBeInTheDocument();
    expect(screen.getByText('مرورگر وب (مدیریت)')).toBeInTheDocument();
    expect(screen.getByText('موبایل مدیریت')).toBeInTheDocument();
    expect(screen.getByText('این دستگاه')).toBeInTheDocument();
    expect(screen.getByText(/3 نشست فعال/)).toBeInTheDocument();
  });

  it('revokes a non-current device from its row and reports the outcome', async () => {
    render(<SessionManagementPage />);
    await screen.findByText('مرورگر وب (مدیریت)');

    fireEvent.click(screen.getByRole('button', { name: 'خروج از دستگاه مرورگر وب (مدیریت)' }));
    fireEvent.click(screen.getByRole('button', { name: 'خروج از این دستگاه' }));

    await waitFor(() => expect(screen.queryByText('مرورگر وب (مدیریت)')).not.toBeInTheDocument());
    expect(screen.getByText('خروج از این دستگاه انجام شد.')).toBeInTheDocument();
    expect(signOutMock).not.toHaveBeenCalled();
  });

  it('revoking the current session signs the operator out', async () => {
    render(<SessionManagementPage />);
    await screen.findByText('لپ‌تاپ عملیات');

    fireEvent.click(screen.getByRole('button', { name: 'خروج از دستگاه لپ‌تاپ عملیات' }));
    fireEvent.click(screen.getByRole('button', { name: 'خروج از این دستگاه' }));

    await waitFor(() => expect(signOutMock).toHaveBeenCalledTimes(1));
  });

  it('logout-all signs the operator out after confirmation', async () => {
    render(<SessionManagementPage />);
    await screen.findByText('لپ‌تاپ عملیات');

    fireEvent.click(screen.getByRole('button', { name: 'خروج از همهٔ دستگاه‌ها' }));
    fireEvent.click(screen.getByRole('button', { name: 'خروج از همه' }));

    await waitFor(() => expect(signOutMock).toHaveBeenCalledTimes(1));
  });

  it('keeps the current row visible without a regression to an empty list', async () => {
    const fixture = SessionManagementFixture.create();
    setSessionServiceOverrideForTests(fixture);
    render(<SessionManagementPage />);
    await screen.findByText('لپ‌تاپ عملیات');

    fireEvent.click(screen.getByRole('button', { name: 'خروج از دستگاه مرورگر وب (مدیریت)' }));
    fireEvent.click(screen.getByRole('button', { name: 'خروج از این دستگاه' }));

    await waitFor(() =>
      expect(screen.queryByTestId('session-row-fixture-session-web')).not.toBeInTheDocument(),
    );
    expect(screen.getByText(/2 نشست فعال/)).toBeInTheDocument();
    expect(screen.getByText('لپ‌تاپ عملیات')).toBeInTheDocument();
  });
});