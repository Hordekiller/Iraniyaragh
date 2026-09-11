import { act, renderHook, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { SessionSummary } from '@iranyaragh/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FeedbackProvider } from '@/components/ui/FeedbackProvider';
import {
  SessionExpiredError,
  SessionNetworkError,
  SessionNotFoundError,
  SessionUpstreamError,
  type SessionManagementPort,
} from '../session-port';
import { SessionManagementFixture } from '../session-fixture';
import { useAuthSessions } from '../use-auth-sessions';

function wrapper({ children }: { children: ReactNode }) {
  return <FeedbackProvider>{children}</FeedbackProvider>;
}

function currentSession(service: SessionManagementPort): Promise<SessionSummary> {
  return service.listSessions().then((sessions) => sessions.find((s) => s.current)!);
}

describe('useAuthSessions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads the session list into ready state', async () => {
    const service = SessionManagementFixture.create();
    const { result } = renderHook(() => useAuthSessions({ service }), { wrapper });

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.sessions).toHaveLength(3);
    expect(result.current.sessions.some((s) => s.current)).toBe(true);
  });

  it('revokes a non-current session, refreshes the list and reports feedback', async () => {
    const service = SessionManagementFixture.create();
    const { result } = renderHook(() => useAuthSessions({ service }), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    const web = (await service.listSessions()).find((s) => s.sessionId === 'fixture-session-web')!;
    act(() => result.current.revoke(web));

    await waitFor(() => expect(result.current.sessions.some((s) => s.sessionId === web.sessionId)).toBe(false));
    await expect(screen.findByText('خروج از این دستگاه انجام شد.')).resolves.toBeInTheDocument();
    expect(result.current.actionBusy).toBeNull();
  });

  it('revoking the current session triggers onSessionEnded', async () => {
    const service = SessionManagementFixture.create();
    const onSessionEnded = vi.fn();
    const { result } = renderHook(() => useAuthSessions({ service, onSessionEnded }), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    const current = await currentSession(service);
    act(() => result.current.revoke(current));
    await waitFor(() => expect(onSessionEnded).toHaveBeenCalledTimes(1));
    expect(result.current.actionBusy).toBeNull();
  });

  it('logout-all reports success and triggers onSessionEnded', async () => {
    const service = SessionManagementFixture.create();
    const onSessionEnded = vi.fn();
    const { result } = renderHook(() => useAuthSessions({ service, onSessionEnded }), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    act(() => result.current.logoutAll());
    await waitFor(() => expect(onSessionEnded).toHaveBeenCalledTimes(1));
    await expect(screen.findByText('از همهٔ دستگاه‌ها خارج شدید.')).resolves.toBeInTheDocument();
  });

  it('surface NOT_FOUND on revoke as a warning and reloads the list', async () => {
    const fixture = SessionManagementFixture.create();
    const service: SessionManagementPort = {
      listSessions: () => fixture.listSessions(),
      revokeSession: async () => {
        throw new SessionNotFoundError();
      },
      logoutAll: () => fixture.logoutAll(),
    };
    const { result } = renderHook(() => useAuthSessions({ service }), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    const web = (await service.listSessions()).find((s) => s.sessionId === 'fixture-session-web')!;
    act(() => result.current.revoke(web));

    await expect(screen.findByText(/این نشست دیگر فعال نیست/)).resolves.toBeInTheDocument();
    await waitFor(() => expect(result.current.actionBusy).toBeNull());
    expect(result.current.sessions).toHaveLength(3);
  });

  it('keeps the list and reports error feedback on a network failure while revoking', async () => {
    const fixture = SessionManagementFixture.create();
    const service: SessionManagementPort = {
      listSessions: () => fixture.listSessions(),
      revokeSession: async () => {
        throw new SessionNetworkError();
      },
      logoutAll: () => fixture.logoutAll(),
    };
    const { result } = renderHook(() => useAuthSessions({ service }), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    const web = (await service.listSessions()).find((s) => s.sessionId === 'fixture-session-web')!;
    act(() => result.current.revoke(web));

    await expect(screen.findByText('امکان برقراری ارتباط با سامانه وجود ندارد.')).resolves.toBeInTheDocument();
    await waitFor(() => expect(result.current.actionBusy).toBeNull());
    expect(result.current.sessions).toHaveLength(3);
  });

  it('logout-all still ends the session locally when the network fails during it', async () => {
    const fixture = SessionManagementFixture.create();
    const service: SessionManagementPort = {
      listSessions: () => fixture.listSessions(),
      revokeSession: (id) => fixture.revokeSession(id),
      logoutAll: async () => {
        throw new SessionNetworkError();
      },
    };
    const onSessionEnded = vi.fn();
    const { result } = renderHook(() => useAuthSessions({ service, onSessionEnded }), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    act(() => result.current.logoutAll());
    await waitFor(() => expect(onSessionEnded).toHaveBeenCalledTimes(1));
    await expect(screen.findByText(/اتصال برقرار نشد؛ ولی از این دستگاه خارج می‌شوید/)).resolves.toBeInTheDocument();
  });

  it('only surfaces a warning (without ending the session) when logout-all hits a server error', async () => {
    const fixture = SessionManagementFixture.create();
    const service: SessionManagementPort = {
      listSessions: () => fixture.listSessions(),
      revokeSession: (id) => fixture.revokeSession(id),
      logoutAll: async () => {
        throw new SessionUpstreamError('سرور پاسخ نداد.', 'INTERNAL_ERROR', 'r1');
      },
    };
    const onSessionEnded = vi.fn();
    const { result } = renderHook(() => useAuthSessions({ service, onSessionEnded }), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    act(() => result.current.logoutAll());
    await waitFor(() => expect(result.current.actionBusy).toBeNull());
    await expect(screen.findByText('سرور پاسخ نداد.')).resolves.toBeInTheDocument();
    expect(onSessionEnded).toHaveBeenCalledTimes(1);
  });

  it('surfaces an expired session as requireReauth instead of only feedback', async () => {
    const fixture = SessionManagementFixture.create();
    const service: SessionManagementPort = {
      listSessions: async () => {
        throw new SessionExpiredError();
      },
      revokeSession: (id) => fixture.revokeSession(id),
      logoutAll: () => fixture.logoutAll(),
    };
    const { result } = renderHook(() => useAuthSessions({ service }), { wrapper });

    await waitFor(() => expect(result.current.requireReauth).toBe(true));
    expect(result.current.status).toBe('error');
  });

  it('guards against concurrent actions: a second revoke is ignored while one is in flight', async () => {
    const fixture = SessionManagementFixture.create();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const service: SessionManagementPort = {
      listSessions: () => fixture.listSessions(),
      revokeSession: async (id) => {
        await gate;
        await fixture.revokeSession(id);
      },
      logoutAll: () => fixture.logoutAll(),
    };
    const { result } = renderHook(() => useAuthSessions({ service }), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    const [web] = (await service.listSessions()).filter((s) => !s.current);
    act(() => {
      result.current.revoke(web);
      result.current.revoke(web); // second call must be ignored
    });

    act(() => release());
    await waitFor(() => expect(result.current.actionBusy).toBeNull());
    expect(result.current.sessions.some((s) => s.sessionId === web.sessionId)).toBe(false);
  });
});