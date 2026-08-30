import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AdminThemeProvider } from '@/theme/AdminThemeProvider';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'پنل عملیات ایران یراق',
    template: '%s | ایران یراق',
  },
  description: 'مدیریت یکپارچه فروش، انبار و عملیات ایران یراق',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="fa" dir="rtl">
      <body>
        <AdminThemeProvider>{children}</AdminThemeProvider>
      </body>
    </html>
  );
}
