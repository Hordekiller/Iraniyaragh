import { Box, CircularProgress, Typography } from '@mui/material';

/**
 * Neutral placeholder shown while a valid session is being recovered from its
 * cookie on every full page load. It deliberately does not reuse the login
 * layout: operators read that screen as "signed out" even though the session is
 * simply being restored (#514). The login surface is only for a missing session.
 */
export function SessionRestoring() {
  return (
    <Box
      role="status"
      aria-live="polite"
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 1.5,
        bgcolor: 'var(--admin-body-bg)',
        color: 'text.secondary',
      }}
    >
      <CircularProgress size={28} aria-hidden="true" />
      <Typography component="p" variant="body2">
        در حال بازیابی نشست
      </Typography>
    </Box>
  );
}
