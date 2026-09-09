'use client';

import createCache from '@emotion/cache';
import { CacheProvider } from '@emotion/react';
import { CssBaseline, ThemeProvider, createTheme } from '@mui/material';
import { useMemo, type ReactNode } from 'react';
import { prefixer } from 'stylis';
import rtlPlugin from 'stylis-plugin-rtl';
import { useAdminPreferences } from '@/lib/preferences/AdminPreferencesProvider';

const rtlCache = createCache({
  key: 'iraniyaragh-rtl',
  prepend: true,
  stylisPlugins: [prefixer, rtlPlugin],
});

const LIGHT_PALETTE = {
  primary: { main: '#ff5a17', dark: '#d94508', contrastText: '#ffffff' },
  secondary: { main: '#17233a' },
  background: { default: '#f4f6f9', paper: '#ffffff' },
  text: { primary: '#17233a', secondary: '#65738a' },
} as const;

const DARK_PALETTE = {
  primary: { main: '#ff6b2d', dark: '#ff8a55', contrastText: '#ffffff' },
  secondary: { main: '#8ba0c4' },
  background: { default: '#0f1524', paper: '#151c2e' },
  text: { primary: '#e8edf6', secondary: '#9aa8c0' },
} as const;

export function AdminThemeProvider({ children }: Readonly<{ children: ReactNode }>) {
  const { prefs, resolvedMode } = useAdminPreferences();

  const theme = useMemo(
    () =>
      createTheme({
        direction: 'rtl',
        palette: {
          mode: resolvedMode,
          ...(resolvedMode === 'dark' ? DARK_PALETTE : LIGHT_PALETTE),
        },
        shape: { borderRadius: 14 },
        typography: {
          fontFamily: "'Iraniyaragh Sans', Tahoma, Arial, sans-serif",
          button: { textTransform: 'none', fontWeight: 700 },
        },
        components: {
          MuiButtonBase: { defaultProps: { disableRipple: true } },
          // "Bordered" skin surfaces outlines instead of elevation shadows.
          MuiCard: {
            defaultProps: { variant: prefs.skin === 'bordered' ? 'outlined' : 'elevation' },
          },
          MuiPaper: {
            styleOverrides: {
              elevation: {
                ...(prefs.skin === 'bordered' ? { boxShadow: 'none', border: '1px solid' } : {}),
                borderColor: resolvedMode === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(23,35,58,0.08)',
              },
            },
          },
        },
      }),
    [resolvedMode, prefs.skin],
  );

  return (
    <CacheProvider value={rtlCache}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </CacheProvider>
  );
}