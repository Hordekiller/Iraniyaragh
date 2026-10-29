import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import type { ReactNode } from 'react';
import { AdminThemeProvider } from '@/theme/AdminThemeProvider';
import { AuthProvider } from '@/lib/auth/AuthProvider';
import { AdminPreferencesProvider } from '@/lib/preferences/AdminPreferencesProvider';
import { ADMIN_PREFS_COOKIE, parsePreferencesCookie } from '@/lib/preferences/preferences';
import './globals.css';
import { brandAsset } from '@/lib/brand';

export const metadata: Metadata = {
  title: {
    default: 'پنل عملیات ایرانی یراق',
    template: '%s | ایرانی یراق',
  },
  description: 'مدیریت یکپارچه فروش، انبار و عملیات ایرانی یراق',
  robots: { index: false, follow: false },
  icons: { icon: [{ url: brandAsset('favicon-32.png'), sizes: '32x32', type: 'image/png' }],
    apple: [{ url: brandAsset('apple-touch-icon.png'), sizes: '180x180', type: 'image/png' }] },
};

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const cookieStore = await cookies();
  const initialPreferences = parsePreferencesCookie(cookieStore.get(ADMIN_PREFS_COOKIE)?.value);

  return (
    <html lang="fa" dir="rtl">
      <body>
        <AdminPreferencesProvider initialPrefs={initialPreferences}>
          <AdminThemeProvider>
            <AuthProvider>{children}</AuthProvider>
          </AdminThemeProvider>
        </AdminPreferencesProvider>
      </body>
    </html>
  );
}
