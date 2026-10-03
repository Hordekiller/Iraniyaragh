'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AccessTokenData, CurrentPrincipalResponse } from '@iranyaragh/contracts';
import { ApiAbortError, ApiClientError, apiFetch, readCsrfToken, recoverApiSession, registerSessionRecovery, settleSessionRecovery } from '@/lib/api/client';
import { getAccessToken, setAccessToken } from './token-store';

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
  signOut: () => Promise<void>;
  /** Adopt the session verified by the real staff password + TOTP login. */
  establishSession: (input: { accessToken: string; principal: AuthUser }) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function serializeCookieMutation<T>(operation: () => Promise<T>): Promise<T> {
  return await (typeof navigator !== 'undefined' && navigator.locks
    ? navigator.locks.request('iranyaragh-auth-refresh', operation)
    : operation());
}

export function AuthProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isRestoring, setIsRestoring] = useState(true);
  const generation = useRef(0);
  const userRef = useRef<AuthUser | null>(null);

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
  }, []);

  const recoverSession = useCallback(async (): Promise<string> => {
    const attemptGeneration = generation.current;
    const expectedUserId = userRef.current?.userId;
    const rotate = async () => {
      if (generation.current !== attemptGeneration) throw new ApiAbortError();
      const refreshed = await apiFetch<AccessTokenData>('/auth/refresh', { method: 'POST', recoverSession: false });
      const token = refreshed.data.accessToken;
      if (!token) throw new ApiClientError({ code: 'AUTH_SESSION_INVALID', message: '', requestId: '', statusCode: 401 });
      const verified = await apiFetch<CurrentPrincipalResponse['data']>('/auth/me', { token, recoverSession: false });
      if (verified.data.principal.authenticationLevel !== 'STAFF_MFA' || (expectedUserId && verified.data.principal.userId !== expectedUserId)) {
        throw new ApiClientError({ code: 'AUTH_REAUTHENTICATION_REQUIRED', message: '', requestId: '', statusCode: 401 });
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
      if (generation.current === attemptGeneration && error instanceof ApiClientError && (error.statusCode === 401 || error.statusCode === 403)) {
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
    if (readCsrfToken(document)) {
      void recoverApiSession().catch(() => { /* Recovery fails closed; the login surface handles reauthentication. */ })
        .finally(() => { if (active) setIsRestoring(false); });
    } else setIsRestoring(false);
    return () => { active = false; unregister(); };
  }, [recoverSession]);

  const signOut = useCallback(async (): Promise<void> => {
    const token = getAccessToken();
    generation.current += 1;
    const logoutGeneration = generation.current;
    setAccessToken(null);
    userRef.current = null;
    setUser(null);
    try {
      // Let any rotation finish first, then revoke the cookie it actually issued.
      await settleSessionRecovery();
      await serializeCookieMutation(async () => {
        if (generation.current !== logoutGeneration) return;
        if (token || readCsrfToken(document)) {
          await apiFetch<Record<string, never>>('/auth/logout', { method: 'POST', recoverSession: false });
        }
      });
    } catch {
      // Idempotent logout: clear local state even if the API is unreachable.
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: user !== null,
      isRestoring,
      signOut,
      establishSession,
    }),
    [user, isRestoring, signOut, establishSession],
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
