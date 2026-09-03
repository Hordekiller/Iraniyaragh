'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Box, Button, Paper, TextField, Typography } from '@mui/material';
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
    return null;
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

    if (result.ok) {
      router.replace('/dashboard');
      router.refresh();
    } else {
      setError(result.error);
    }
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'background.default',
        p: 2,
      }}
    >
      <Paper
        elevation={0}
        sx={{
          width: '100%',
          maxWidth: 420,
          p: { xs: 3, sm: 4 },
          borderRadius: 3,
          border: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Box sx={{ mb: 3, textAlign: 'center' }}>
          <Box
            sx={{
              width: 48,
              height: 48,
              mx: 'auto',
              mb: 1.5,
              borderRadius: 2,
              bgcolor: 'primary.main',
              color: 'primary.contrastText',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: '1.25rem',
            }}
            aria-hidden="true"
          >
            آی
          </Box>
          <Typography variant="h5" fontWeight={700}>
            ورود به پنل عملیات
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            ایران یراق — مرکز عملیات
          </Typography>
        </Box>

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
            helperText={error ?? 'برای ورود، کد ویژه‌ای که توسط تیم پلتفرم صادر شده را وارد کنید.'}
            inputProps={{ 'aria-label': 'کد دسترسی توسعه‌دهنده', dir: 'ltr' }}
            sx={{ mb: 2 }}
          />

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          <Button type="submit" variant="contained" fullWidth size="large" disabled={busy}>
            {busy ? 'در حال ورود…' : 'ورود'}
          </Button>
        </form>

        <Box sx={{ mt: 3, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
          <Typography variant="caption" color="text.secondary">
            این روش ورود صرفاً برای محیط توسعه و آزمایش فعال است و در استیجینگ و تولید غیرفعال
            خواهد بود.
          </Typography>
        </Box>
      </Paper>
    </Box>
  );
}
