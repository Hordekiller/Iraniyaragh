'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  ADMIN_PREFS_COOKIE,
  defaultPreferences,
  resolveMode,
  serializePreferences,
  type AdminPreferences,
} from './preferences';

export type AdminPreferencesContextValue = {
  prefs: AdminPreferences;
  /** Actual light/dark mode after resolving `system`. */
  resolvedMode: 'light' | 'dark';
  updatePrefs: (patch: Partial<AdminPreferences>) => void;
  resetPrefs: () => void;
};

export const AdminPreferencesContext = createContext<AdminPreferencesContextValue | null>(null);

type AdminPreferencesProviderProps = {
  children: ReactNode;
  /** Server-initialized preferences (from the cookie) to avoid flicker. */
  initialPrefs?: AdminPreferences;
};

export function AdminPreferencesProvider({
  children,
  initialPrefs = defaultPreferences,
}: AdminPreferencesProviderProps) {
  const [prefs, setPrefs] = useState<AdminPreferences>(initialPrefs);
  const [systemPrefersDark, setSystemPrefersDark] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => setSystemPrefersDark(media.matches);
    apply();
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', apply);
      return () => media.removeEventListener('change', apply);
    }
    if (typeof media.addListener === 'function') {
      media.addListener(apply);
      return () => media.removeListener(apply);
    }
    return undefined;
  }, []);

  const resolvedMode = resolveMode(prefs.mode, systemPrefersDark);

  const updatePrefs = useCallback((patch: Partial<AdminPreferences>) => {
    setPrefs((current) => ({ ...current, ...patch }));
  }, []);

  const resetPrefs = useCallback(() => setPrefs(defaultPreferences), []);

  // Mirror resolved preferences on <html> so CSS modules can theme the shell.
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.adminMode = resolvedMode;
    root.dataset.adminSkin = prefs.skin;
    root.dataset.adminLayout = prefs.layout;
    root.dataset.adminWidth = prefs.contentWidth;
    root.style.colorScheme = resolvedMode;
  }, [prefs, resolvedMode]);

  // Persist to a non-secret cookie (display prefs only).
  useEffect(() => {
    try {
      document.cookie = `${ADMIN_PREFS_COOKIE}=${encodeURIComponent(serializePreferences(prefs))};path=/;max-age=31536000;samesite=lax`;
    } catch {
      // Cookie writes can fail in restricted contexts; preferences simply won't persist.
    }
  }, [prefs]);

  const value = useMemo<AdminPreferencesContextValue>(
    () => ({ prefs, resolvedMode, updatePrefs, resetPrefs }),
    [prefs, resolvedMode, updatePrefs, resetPrefs],
  );

  return <AdminPreferencesContext.Provider value={value}>{children}</AdminPreferencesContext.Provider>;
}

export function useAdminPreferences(): AdminPreferencesContextValue {
  const context = useContext(AdminPreferencesContext);
  if (!context) {
    throw new Error('useAdminPreferences must be used within an AdminPreferencesProvider.');
  }
  return context;
}

export type { AdminMode, AdminSkin, AdminLayoutType, ContentWidth } from './preferences';