'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, TextField } from '@mui/material';
import { AuthSurface } from '@/components/auth/AuthSurface';
import { AuthTransition } from '@/components/auth/AuthTransition';
import { useAuth } from '@/lib/auth/AuthProvider';

/**
 * Development/test harness for the env-gated `/auth/dev/signin` endpoint.
 * The server route enclosing this client component returns 404 unless the same
 * server-only AUTH_DEV_CODE gate as the API has been explicitly configured.
 */
export function DevLoginForm() {
  const router = useRouter();
  const { isAuthenticated, signIn } = useAuth();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      router.replace('/dashboard');
    }
  }, [isAuthenticated, router]);

  if (isAuthenticated) {
    return <AuthTransition title="ورود با موفقیت انجام شد" description="در حال انتقال امن به داشبورد عملیات هستید." />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const trimmed = code.trim();
    if (!trimmed) {
      setError('کد دسترسی را وارد کنید.');
      return;
    }

    setBusy(true);
    const result = await signIn(trimmed);
    setBusy(false);

    if (!result.ok) {
      setError(result.error);
    }
  }

  return (
    <AuthSurface
      title="ورود توسعه‌دهنده"
      description="این مسیر فقط برای آزمون محلیِ کنترل‌شده است. ورود عملیاتی از مسیر اصلی انجام می‌شود."
      footer={<>این صفحه بدون فعال‌سازی صریح محیط توسعه/آزمایش با پاسخ ۴۰۴ بسته می‌شود.</>}
    >
      <form onSubmit={handleSubmit} noValidate>
        <TextField
          label="کد دسترسی توسعه‌دهنده"
          variant="outlined"
          fullWidth
          autoFocus
          autoComplete="off"
          value={code}
          onChange={event => setCode(event.target.value)}
          disabled={busy}
          error={error !== null}
          helperText="کد فقط در حافظه نگهداری می‌شود و در مرورگر ذخیره نمی‌شود."
          inputProps={{ 'aria-label': 'کد دسترسی توسعه‌دهنده', dir: 'ltr' }}
          sx={{ mb: 2.5 }}
        />

        {error && (
          <Alert severity="error" role="alert" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Button type="submit" variant="contained" fullWidth size="large" disabled={busy}>
          {busy ? 'در حال ورود…' : 'ورود به پنل'}
        </Button>
      </form>
    </AuthSurface>
  );
}
