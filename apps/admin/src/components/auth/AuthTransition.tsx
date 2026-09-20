import { Box, CircularProgress, Typography } from '@mui/material';
import { AuthSurface } from './AuthSurface';

export function AuthTransition({
  title,
  description,
}: Readonly<{
  title: string;
  description: string;
}>) {
  return (
    <AuthSurface
      title={title}
      description={description}
      footer="اگر انتقال بیش از چند لحظه طول کشید، اتصال شبکه را بررسی و صفحه را دوباره بارگذاری کنید."
    >
      <Box
        role="status"
        aria-live="polite"
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          minHeight: 48,
          color: 'text.secondary',
        }}
      >
        <CircularProgress size={26} aria-hidden="true" />
        <Typography component="p" variant="body2">
          لطفاً چند لحظه منتظر بمانید…
        </Typography>
      </Box>
    </AuthSurface>
  );
}
