'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { SessionSummary } from '@iranyaragh/contracts';
import { useFeedback } from '@/components/ui/FeedbackProvider';
import {
  SessionExpiredError,
  SessionManagementError,
  SessionNetworkError,
  SessionNotFoundError,
  SessionReauthenticationRequiredError,
  type SessionManagementPort,
} from './session-port';

export type SessionPageStatus = 'loading' | 'ready' | 'error';

export type SessionActionKey = 'revoke' | 'logout-all' | null;

export type UseAuthSessionsOptions = {
  service: SessionManagementPort;
  /** Invoked when the current session is revoked or when logout-all runs. */
  onSessionEnded?: () => void;
};

function friendlyMessage(error: unknown): string {
  if (error instanceof SessionManagementError) return error.message;
  return 'خطای غیرمنتظره سامانه.';
}

function isSessionInvalid(error: unknown): boolean {
  return error instanceof SessionExpiredError || error instanceof SessionReauthenticationRequiredError;
}

/**
 * Client page-model for the session/devices management panel. Loads the session
 * list, then exposes revoke + logout-all actions that keep the list fresh and
 * report outcomes through the feedback provider.
 *
 * Revoking the current session or running logout-all triggers `onSessionEnded`
 * so the caller can sign the operator out; the server owns all authorization
 * and any expiry/reauth surface raises `requireReauth` for the shell to render.
 */
export function useAuthSessions({ service, onSessionEnded }: UseAuthSessionsOptions) {
  const feedback = useFeedback();
  const [status, setStatus] = useState<SessionPageStatus>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [requireReauth, setRequireReauth] = useState(false);
  const [actionBusy, setActionBusy] = useState<SessionActionKey>(null);
  const [busySessionId, setBusySessionId] = useState<string | null>(null);
  const inflight = useRef<SessionActionKey>(null);
  const onSessionEndedRef = useRef(onSessionEnded);
  onSessionEndedRef.current = onSessionEnded;

  const load = useCallback(async () => {
    setStatus('loading');
    setLoadError(null);
    try {
      const next = await service.listSessions();
      setSessions(next);
      setStatus('ready');
    } catch (error) {
      if (isSessionInvalid(error)) {
        setRequireReauth(true);
        setStatus('error');
        setLoadError(friendlyMessage(error));
        return;
      }
      setLoadError(friendlyMessage(error));
      setStatus('error');
    }
  }, [service]);

  useEffect(() => {
    void load();
  }, [load]);

  const revoke = useCallback(
    (session: SessionSummary) => {
      if (inflight.current !== null) return;
      inflight.current = 'revoke';
      setActionBusy('revoke');
      setBusySessionId(session.sessionId);
      void (async () => {
        try {
          await service.revokeSession(session.sessionId);
          if (session.current) {
            onSessionEndedRef.current?.();
            return;
          }
          setSessions((current) => current.filter((item) => item.sessionId !== session.sessionId));
          feedback.success('خروج از این دستگاه انجام شد.');
        } catch (error) {
          if (isSessionInvalid(error)) {
            setRequireReauth(true);
            setStatus('error');
            setLoadError(friendlyMessage(error));
            return;
          }
          if (error instanceof SessionNotFoundError) {
            feedback.warning(error.message);
            await load();
            return;
          }
          feedback.error(friendlyMessage(error));
        } finally {
          inflight.current = null;
          setActionBusy(null);
          setBusySessionId(null);
        }
      })();
    },
    [service, feedback, load],
  );

  const logoutAll = useCallback(() => {
    if (inflight.current !== null) return;
    inflight.current = 'logout-all';
    setActionBusy('logout-all');
    void (async () => {
      try {
        await service.logoutAll();
        feedback.success('از همهٔ دستگاه‌ها خارج شدید.');
      } catch (error) {
        if (isSessionInvalid(error)) {
          setRequireReauth(true);
          setStatus('error');
          setLoadError(friendlyMessage(error));
          return;
        }
        if (error instanceof SessionNetworkError) {
          feedback.warning('اتصال برقرار نشد؛ ولی از این دستگاه خارج می‌شوید. سایر دستگاه‌ها را بعداً بررسی کنید.');
        } else {
          feedback.error(friendlyMessage(error));
        }
      } finally {
        inflight.current = null;
        setActionBusy(null);
        onSessionEndedRef.current?.();
      }
    })();
  }, [service, feedback]);

  return {
    status,
    loadError,
    sessions,
    requireReauth,
    actionBusy,
    busySessionId,
    reload: load,
    revoke,
    logoutAll,
  };
}