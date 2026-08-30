'use client';

import createCache from '@emotion/cache';
import { CacheProvider } from '@emotion/react';
import { CssBaseline, ThemeProvider, createTheme } from '@mui/material';
import type { ReactNode } from 'react';
import { prefixer } from 'stylis';
import rtlPlugin from 'stylis-plugin-rtl';

const rtlCache = createCache({
  key: 'iraniyaragh-rtl',
  prepend: true,
  stylisPlugins: [prefixer, rtlPlugin],
});

const theme = createTheme({
  direction: 'rtl',
  palette: {
    mode: 'light',
    primary: { main: '#ff5a17', dark: '#d94508', contrastText: '#ffffff' },
    secondary: { main: '#17233a' },
    background: { default: '#f4f6f9', paper: '#ffffff' },
    text: { primary: '#17233a', secondary: '#65738a' },
  },
  shape: { borderRadius: 14 },
  typography: {
    fontFamily: "'Iraniyaragh Sans', Tahoma, Arial, sans-serif",
    button: { textTransform: 'none', fontWeight: 700 },
  },
  components: {
    MuiButtonBase: { defaultProps: { disableRipple: true } },
  },
});

export function AdminThemeProvider({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <CacheProvider value={rtlCache}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </CacheProvider>
  );
}
