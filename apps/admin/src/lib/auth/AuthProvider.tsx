'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AccessTokenData, CurrentPrincipalResponse } from '@iranyaragh/contracts';
import { ApiAbortError, ApiClientError, apiFetch, readCsrfToken, recoverApiSession, registerSessionRecovery, settleSessionRecovery, registerAuthenticationFailure, notifyFreshAuthentication } from '@/lib/api/client';
import { getAccessToken, getSessionRevision, setAccessToken } from './token-store';

export type AuthUser = {
  userId: string;
  sessionId: string;
  authenticationLevel: string;
  permissions: string[];
};

type AuthContextValue = {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isRestoring: boolean;
  freshAuthenticationRequired: boolean;
  freshAuthenticationOpen: boolean;
  showFreshAuthentication: () => void;
  dismissFreshAuthentication: () => void;
  reauthenticate: (operation: () => Promise<{ accessToken: string; principal: AuthUser }>) => Promise<void>;
  signOut: () => Promise<void>;
  /** Clear this identity only after the API acknowledged its revocation. */
  endRevokedSession: (expectedRevision: number, sessionId?: string) => boolean;
  /** Adopt the session verified by the real staff password + TOTP login. */
  establishSession: (input: { accessToken: string; principal: AuthUser }) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function serializeCookieMutation<T>(operation: () => Promise<T>): Promise<T> {
  if (typeof navigator === 'undefined' || !navigator.locks) return operation();
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), 10000);
  try {
    // Shared cookie namespace: match Web's CROSS_TAB_REFRESH_LOCK exactly.
    return await navigator.locks.request('iranyaragh:auth:refresh', { mode: 'exclusive', signal: abort.signal }, () => {
      clearTimeout(timeout);
      return operation();
    });
  } finally { clearTimeout(timeout); }
}

export function AuthProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isRestoring, setIsRestoring] = useState(true);
  const [freshAuthenticationRequired, setFreshAuthenticationRequired] = useState(false);
  const [freshAuthenticationOpen, setFreshAuthenticationOpen] = useState(false);
  const generation = useRef(0);
  const userRef = useRef<AuthUser | null>(null);
  const loggingOut = useRef(false);

  const establishSession = useCallback((input: { accessToken: string; principal: AuthUser }): void => {
    generation.current += 1;
    setAccessToken(input.accessToken);
    userRef.current = input.principal;
    setUser({
      userId: input.principal.userId,
      sessionId: input.principal.sessionId,
      authenticationLevel: input.principal.authenticationLevel,
      permissions: input.principal.permissions,
    });
    setIsRestoring(false);
    setFreshAuthenticationRequired(false);
    setFreshAuthenticationOpen(false);
  }, []);

  const recoverSession = useCallback(async (): Promise<string> => {
    if (loggingOut.current) throw new ApiAbortError();
    const attemptGeneration = generation.current;
    const expectedUserId = userRef.current?.userId;
    const rotate = async () => {
      if (loggingOut.current || generation.current !== attemptGeneration) throw new ApiAbortError();
      const refreshed = await apiFetch<AccessTokenData>('/auth/refresh', { method: 'POST', recoverSession: false });
      const token = refreshed.data.accessToken;
      if (!token) throw new ApiClientError({ code: 'AUTH_SESSION_INVALID', message: '', requestId: '', statusCode: 401 });
      const verified = await apiFetch<CurrentPrincipalResponse['data']>('/auth/me', { token, recoverSession: false });
      if (verified.data.principal.authenticationLevel !== 'STAFF_MFA' || (expectedUserId && verified.data.principal.userId !== expectedUserId)) {
        throw new ApiClientError({ code: 'AUTH_SESSION_INVALID', message: '', requestId: '', statusCode: 401 });
      }
      if (generation.current !== attemptGeneration) throw new ApiAbortError();
      setAccessToken(token, true);
      userRef.current = verified.data.principal;
      setUser(verified.data.principal);
      return token;
    };
    try {
      // Cookies are shared across tabs. Serialize rotations across the origin too.
      return await serializeCookieMutation(rotate);
    } catch (error) {
      if (generation.current === attemptGeneration && error instanceof ApiClientError && ['AUTH_SESSION_INVALID', 'AUTH_SESSION_REPLAYED', 'FORBIDDEN'].includes(error.code)) {
        setAccessToken(null);
        userRef.current = null;
        setUser(null);
      }
      throw error;
    }
  }, []);

  useEffect(() => {
    let active = true;
    const unregister = registerSessionRecovery(recoverSession);
    const unregisterFailure = registerAuthenticationFailure((error, revision) => {
      if (loggingOut.current || !userRef.current || revision !== getSessionRevision()) return;
      if (error.code === 'AUTH_REAUTHENTICATION_REQUIRED') {
        setFreshAuthenticationRequired(true);
        setFreshAuthenticationOpen(true);
      } else if (error.code === 'AUTH_SESSION_INVALID' || error.code === 'AUTH_SESSION_REPLAYED') {
        generation.current += 1;
        setAccessToken(null);
        userRef.current = null;
        setUser(null);
      }
    });
    if (readCsrfToken(document)) {
      void recoverApiSession().catch(() => { /* Recovery fails closed; the login surface handles reauthentication. */ })
        .finally(() => { if (active) setIsRestoring(false); });
    } else setIsRestoring(false);
    return () => { active = false; unregister(); unregisterFailure(); };
  }, [recoverSession]);

  const reauthenticate = useCallback(async (operation: () => Promise<{ accessToken: string; principal: AuthUser }>): Promise<void> => {
    const expectedUserId = userRef.current?.userId;
    const expectedGeneration = generation.current;
    if (!expectedUserId || loggingOut.current) throw new ApiAbortError();
    await settleSessionRecovery();
    await serializeCookieMutation(async () => {
      if (loggingOut.current || expectedGeneration !== generation.current) throw new ApiAbortError();
      // Discard late failures/replays for the previous token before issuing a
      // fresh session. The mounted form survives; nothing is auto-submitted.
      generation.current += 1;
      const attemptGeneration = generation.current;
      setAccessToken(getAccessToken());
      const result = await operation();
      if (loggingOut.current || attemptGeneration !== generation.current) throw new ApiAbortError();
      if (!result.accessToken || result.principal.authenticationLevel !== 'STAFF_MFA' || result.principal.userId !== expectedUserId) {
        setAccessToken(null);
        userRef.current = null;
        setUser(null);
        throw new ApiClientError({ code: 'AUTH_SESSION_INVALID', message: '', requestId: '', statusCode: 401 });
      }
      setAccessToken(result.accessToken, true);
      userRef.current = result.principal;
      setUser(result.principal);
      setFreshAuthenticationRequired(false);
      setFreshAuthenticationOpen(false);
      notifyFreshAuthentication();
    });
  }, []);

  const showFreshAuthentication = useCallback(() => { setFreshAuthenticationOpen(true); }, []);
  const dismissFreshAuthentication = useCallback(() => { setFreshAuthenticationOpen(false); }, []);

  const signOut = useCallback(async (): Promise<void> => {
    if (loggingOut.current) throw new ApiAbortError();
    const token = getAccessToken();
    loggingOut.current = true;
    generation.current += 1;
    const logoutGeneration = generation.current;
    // Invalidate late request replays while retaining identity until revocation
    // is acknowledged. A network failure must not be presented as logout.
    setAccessToken(token);
    try {
      // Let any rotation finish first, then revoke the cookie it actually issued.
      await settleSessionRecovery();
      await serializeCookieMutation(async () => {
        if (generation.current !== logoutGeneration) return;
        if (token || readCsrfToken(document)) {
          try {
            await apiFetch<Record<string, never>>('/auth/logout', { method: 'POST', recoverSession: false });
          } catch (error) {
            // Device revocation/logout-all may already have ended this session.
            // Only an authoritative invalid-session response confirms that;
            // network, CSRF and other failures must remain retryable errors.
            if (!(error instanceof ApiClientError && error.statusCode === 401 && error.code === 'AUTH_SESSION_INVALID')) throw error;
          }
        }
      });
      if (generation.current === logoutGeneration) {
        setAccessToken(null);
        userRef.current = null;
        setUser(null);
      }
    } finally {
      loggingOut.current = false;
    }
  }, []);

  const endRevokedSession = useCallback((expectedRevision: number, sessionId?: string): boolean => {
    // Rotation stays in the same logical login. Logout-all ends that login even
    // if its backing session rotated; a device-specific revoke only ends its ID.
    if (!userRef.current || getSessionRevision() !== expectedRevision || (sessionId && userRef.current.sessionId !== sessionId)) return false;
    generation.current += 1;
    setAccessToken(null);
    userRef.current = null;
    setUser(null);
    return true;
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: user !== null,
      isRestoring,
      freshAuthenticationRequired,
      freshAuthenticationOpen,
      showFreshAuthentication,
      dismissFreshAuthentication,
      reauthenticate,
      signOut,
      endRevokedSession,
      establishSession,
    }),
    [user, isRestoring, freshAuthenticationRequired, freshAuthenticationOpen, showFreshAuthentication, dismissFreshAuthentication, reauthenticate, signOut, endRevokedSession, establishSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider.');
  }
  return context;
}
