import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { FeedbackProvider } from '@/components/ui/FeedbackProvider';

export const metadata: Metadata = {
  title: 'کاتالوگ و کالا',
  description: 'مدیریت کالاها، برندها و دسته‌بندی‌های کاتالوگ.',
};

export default function CatalogLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <FeedbackProvider>{children}</FeedbackProvider>;
}