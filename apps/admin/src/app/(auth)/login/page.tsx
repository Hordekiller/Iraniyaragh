'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, TextField } from '@mui/material';
import { AuthSurface } from '@/components/auth/AuthSurface';
import { AuthTransition } from '@/components/auth/AuthTransition';
import { useAuth } from '@/lib/auth/AuthProvider';

export default function LoginPage() {
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
      description="برای دسترسی به محیط محلی، کد صادرشده توسط تیم پلتفرم را وارد کنید."
      footer={
        <>این مسیر فقط در محیط توسعه و آزمایش فعال است و در استیجینگ و تولید غیرفعال می‌ماند.</>
      }
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
