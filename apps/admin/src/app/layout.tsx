import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import type { ReactNode } from 'react';
import { AdminThemeProvider } from '@/theme/AdminThemeProvider';
import { AuthProvider } from '@/lib/auth/AuthProvider';
import { AdminPreferencesProvider } from '@/lib/preferences/AdminPreferencesProvider';
import { ADMIN_PREFS_COOKIE, parsePreferencesCookie } from '@/lib/preferences/preferences';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'پنل عملیات ایران یراق',
    template: '%s | ایران یراق',
  },
  description: 'مدیریت یکپارچه فروش، انبار و عملیات ایران یراق',
  robots: { index: false, follow: false },
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
