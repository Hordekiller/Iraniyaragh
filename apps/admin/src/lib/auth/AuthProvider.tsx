'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { apiFetch, ApiClientError, ApiNetworkError } from '@/lib/api/client';
import { getAccessToken, setAccessToken } from './token-store';

export type AuthUser = {
  userId: string;
  sessionId: string;
  authenticationLevel: string;
  permissions: string[];
};

type SignInResult = { ok: true } | { ok: false; error: string };

type AuthContextValue = {
  user: AuthUser | null;
  isAuthenticated: boolean;
  signIn: (code: string, deviceName?: string) => Promise<SignInResult>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

type SignInResponse = {
  accessToken: string;
  principal: {
    userId: string;
    sessionId: string;
    authenticationLevel: string;
    permissions: string[];
  };
};

export function AuthProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [user, setUser] = useState<AuthUser | null>(null);

  const signIn = useCallback(async (code: string, deviceName?: string): Promise<SignInResult> => {
    try {
      const response = await apiFetch<SignInResponse>('/auth/dev/signin', {
        method: 'POST',
        body: { code, ...(deviceName ? { deviceName } : {}) },
      });

      const token = response.data.accessToken;
      setAccessToken(token);
      setUser({
        userId: response.data.principal.userId,
        sessionId: response.data.principal.sessionId,
        authenticationLevel: response.data.principal.authenticationLevel,
        permissions: response.data.principal.permissions,
      });
      return { ok: true };
    } catch (error) {
      if (error instanceof ApiClientError) {
        return { ok: false, error: error.message };
      }
      if (error instanceof ApiNetworkError) {
        return { ok: false, error: error.message };
      }
      return { ok: false, error: 'ورود ناموفق بود؛ دوباره تلاش کنید.' };
    }
  }, []);

  const signOut = useCallback(async (): Promise<void> => {
    const token = getAccessToken();
    try {
      if (token) {
        await apiFetch<Record<string, never>>('/auth/logout', { method: 'POST', token });
      }
    } catch {
      // Idempotent logout: clear local state even if the API is unreachable.
    } finally {
      setAccessToken(null);
      setUser(null);
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: user !== null,
      signIn,
      signOut,
    }),
    [user, signIn, signOut],
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
