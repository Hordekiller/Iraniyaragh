'use client';

import createCache from '@emotion/cache';
import { CacheProvider } from '@emotion/react';
import { CssBaseline, ThemeProvider, createTheme } from '@mui/material';
import { useServerInsertedHTML } from 'next/navigation';
import { useMemo, useState, type ReactNode } from 'react';
import { prefixer } from 'stylis';
import rtlPlugin from 'stylis-plugin-rtl';
import { useAdminPreferences } from '@/lib/preferences/AdminPreferencesProvider';

const CACHE_KEY = 'iraniyaragh-rtl';

type InsertedStyle = { name: string; isGlobal: boolean };

/**
 * Emotion cache that reports what it inserted during a server render.
 *
 * Without this registry Emotion writes its `<style>` elements inline, next to
 * the component that needed them. React does not expect those elements when it
 * hydrates, so every Admin page failed hydration (React error 418) and was
 * rendered a second time on the client. Collecting the rules and emitting them
 * through `useServerInsertedHTML` keeps the server markup identical to the
 * client tree. The compat flag stops Emotion from inlining the tags itself.
 */
function createStyleRegistry() {
  const cache = createCache({ key: CACHE_KEY, prepend: true, stylisPlugins: [prefixer, rtlPlugin] });
  cache.compat = true;
  const insert = cache.insert;
  let inserted: InsertedStyle[] = [];
  cache.insert = (...args) => {
    const [selector, serialized] = args;
    if (cache.inserted[serialized.name] === undefined) inserted.push({ name: serialized.name, isGlobal: !selector });
    return insert(...args);
  };
  return { cache, flush: () => { const flushed = inserted; inserted = []; return flushed; } };
}

const LIGHT_PALETTE = {
  primary: { main: '#675dd8', light: '#7367f0', dark: '#5f54c7', contrastText: '#ffffff' },
  secondary: { main: '#808390', light: '#999ca6', dark: '#737682', contrastText: '#ffffff' },
  error: { main: '#ff4c51', light: '#ff7074', dark: '#e64449' },
  warning: { main: '#ff9f43', light: '#ffb269', dark: '#e68f3c' },
  info: { main: '#00bad1', light: '#33c8da', dark: '#00a7bc' },
  success: { main: '#28c76f', light: '#53d28c', dark: '#24b364' },
  background: { default: '#f8f7fa', paper: '#ffffff' },
  text: { primary: '#2f2b3d', secondary: '#6d6b77', disabled: '#a7a5ae' },
  divider: 'rgba(47,43,61,0.12)',
} as const;

const DARK_PALETTE = {
  primary: { main: '#a9a1f6', light: '#c2bcfa', dark: '#8f85f3', contrastText: '#2f2b3d' },
  secondary: { main: '#999ca6', light: '#b2b4bc', dark: '#808390', contrastText: '#ffffff' },
  error: { main: '#ff5d62', light: '#ff7d81', dark: '#e64c51' },
  warning: { main: '#ffab55', light: '#ffbd77', dark: '#e69747' },
  info: { main: '#26c5d8', light: '#51d0df', dark: '#00a7bc' },
  success: { main: '#35cb78', light: '#5ed792', dark: '#24b364' },
  background: { default: '#25293c', paper: '#2f3349' },
  text: { primary: '#e7e3fc', secondary: '#b5b2c4', disabled: '#7e7b8f' },
  divider: 'rgba(231,227,252,0.12)',
} as const;

export function AdminThemeProvider({ children }: Readonly<{ children: ReactNode }>) {
  const { prefs, resolvedMode } = useAdminPreferences();
  const [registry] = useState(createStyleRegistry);

  useServerInsertedHTML(() => {
    const inserted = registry.flush();
    if (inserted.length === 0) return null;
    let rules = '';
    let names = registry.cache.key;
    const globals: Array<{ name: string; style: string }> = [];
    for (const { name, isGlobal } of inserted) {
      const style = registry.cache.inserted[name];
      if (typeof style !== 'string') continue;
      if (isGlobal) globals.push({ name, style });
      else { rules += style; names += ` ${name}`; }
    }
    return (
      <>
        {globals.map(({ name, style }) => (
          <style key={name} data-emotion={`${registry.cache.key}-global ${name}`} dangerouslySetInnerHTML={{ __html: style }} />
        ))}
        {rules ? <style data-emotion={names} dangerouslySetInnerHTML={{ __html: rules }} /> : null}
      </>
    );
  });

  const theme = useMemo(
    () =>
      createTheme({
        direction: 'rtl',
        palette: {
          mode: resolvedMode,
          ...(resolvedMode === 'dark' ? DARK_PALETTE : LIGHT_PALETTE),
        },
        shape: { borderRadius: 6 },
        typography: {
          fontFamily: "'Iraniyaragh Sans', Tahoma, Arial, sans-serif",
          fontSize: 13,
          h1: { fontSize: '2.3rem', fontWeight: 700, lineHeight: 1.45 },
          h2: { fontSize: '1.85rem', fontWeight: 700, lineHeight: 1.5 },
          h3: { fontSize: '1.5rem', fontWeight: 700, lineHeight: 1.55 },
          h4: { fontSize: '1.3rem', fontWeight: 700, lineHeight: 1.6 },
          h5: { fontSize: '1.1rem', fontWeight: 700, lineHeight: 1.65 },
          h6: { fontSize: '0.95rem', fontWeight: 700, lineHeight: 1.7 },
          body1: { fontSize: '0.9rem', lineHeight: 1.8 },
          body2: { fontSize: '0.8rem', lineHeight: 1.8 },
          button: { textTransform: 'none', fontWeight: 700, lineHeight: 1.6 },
          caption: { fontSize: '0.72rem', lineHeight: 1.7 },
        },
        components: {
          MuiCssBaseline: {
            styleOverrides: {
              body: { backgroundColor: 'var(--admin-body-bg)' },
            },
          },
          MuiButtonBase: { defaultProps: { disableRipple: false } },
          MuiButton: {
            defaultProps: { disableElevation: true },
            styleOverrides: {
              root: {
                minHeight: 38,
                borderRadius: 6,
                paddingInline: 18,
              },
              containedPrimary: {
                boxShadow: '0 2px 6px rgba(115,103,240,0.30)',
                '&:hover': { boxShadow: '0 4px 12px rgba(115,103,240,0.38)' },
              },
            },
          },
          // "Bordered" skin surfaces outlines instead of elevation shadows.
          MuiCard: {
            defaultProps: { variant: prefs.skin === 'bordered' ? 'outlined' : 'elevation' },
            styleOverrides: {
              root: {
                backgroundImage: 'none',
                borderRadius: 6,
                boxShadow: prefs.skin === 'bordered' ? 'none' : '0 3px 12px rgba(47,43,61,0.14)',
              },
            },
          },
          MuiPaper: {
            styleOverrides: {
              root: { backgroundImage: 'none' },
              elevation1: {
                ...(prefs.skin === 'bordered' ? { boxShadow: 'none', border: '1px solid' } : {}),
                borderColor: resolvedMode === 'dark' ? 'rgba(231,227,252,0.12)' : 'rgba(47,43,61,0.12)',
              },
            },
          },
          MuiTextField: {
            defaultProps: { size: 'small' },
          },
          MuiOutlinedInput: {
            styleOverrides: {
              root: {
                borderRadius: 6,
                '&:hover .MuiOutlinedInput-notchedOutline': {
                  borderColor: resolvedMode === 'dark' ? '#b5b2c4' : '#6d6b77',
                },
              },
              notchedOutline: {
                borderColor: resolvedMode === 'dark' ? 'rgba(231,227,252,0.22)' : 'rgba(47,43,61,0.22)',
              },
            },
          },
          MuiDialog: {
            styleOverrides: {
              paper: { borderRadius: 8 },
            },
          },
          MuiMenu: {
            styleOverrides: {
              paper: {
                marginTop: 6,
                borderRadius: 6,
                boxShadow: resolvedMode === 'dark'
                  ? '0 5px 30px rgba(15,17,30,0.42)'
                  : '0 5px 30px rgba(47,43,61,0.18)',
              },
            },
          },
          MuiTooltip: {
            styleOverrides: {
              tooltip: { backgroundColor: '#2f2b3d', fontSize: '0.72rem' },
            },
          },
        },
      }),
    [resolvedMode, prefs.skin],
  );

  return (
    <CacheProvider value={registry.cache}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </CacheProvider>
  );
}
