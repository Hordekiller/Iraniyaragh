import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { Box, Container } from '@mui/material';

export const metadata: Metadata = {
  title: 'نمایش کامپوننت‌ها',
};

export default function ShowcaseLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Box component="nav" sx={{ mb: 3 }}>
        <Link
          href="/showcase"
          style={{
            color: 'var(--primary-main, #1976d2)',
            textDecoration: 'none',
            fontSize: '0.875rem',
          }}
        >
          ← بازگشت به فهرست نمایش
        </Link>
      </Box>
      {children}
    </Container>
  );
}
