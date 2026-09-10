'use client';

import { useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Box, Button, Paper, TextField, Typography } from '@mui/material';
import { useSyncExternalStore } from 'react';
import { useAuth } from '@/lib/auth/AuthProvider';
import { StaffAuthFixtureClient } from '@/lib/auth/staff-fixture';
import { isFixtureAuthEnabled } from '@/lib/auth/staff-fixture-guard';
import { StaffLoginController } from '@/lib/auth/staff-login';
import { createMemoryStaffTokenStore } from '@/lib/auth/token-store';

/**
 * Fixture-backed staff sign-in (admin login slice, #50).
 *
 * Route split per #50 decision A: `/login/staff` stays separate so the existing
 * dev-only `/login` and `signInDiAsAdmin` e2e path are untouched until the live
 * staff flow (via the #49 contract/runtime PR) is fully released. The fixture is
 * the only data source here and is fail-closed behind the
 * `NEXT_PUBLIC_FIXTURE_AUTH=true` build opt-in (decision B); real endpoint
 * wiring, refresh/cross-tab behavior and the `AUTH_REAUTHENTICATION_REQUIRED`
 * recovery all land with #74.
 *
 * All challenge/access state stays in controller memory; this page never writes
 * localStorage or sessionStorage. On success the verified principal and access
 * token are bridged into the app-wide session (`useAuth().establishSession`) so
 * the shell renders the permission-filtered navigation and API calls carry the
 * staff token; the token itself is held only in the in-memory token store.
 */
export default function StaffLoginPage() {
  const router = useRouter();
  const { establishSession } = useAuth();
  const enabled = isFixtureAuthEnabled();
  const controller = useMemo(() => {
    const created = new StaffLoginController(
      new StaffAuthFixtureClient(),
      createMemoryStaffTokenStore(),
    );
    created.open();
    return created;
  }, []);
  const state = useSyncExternalStore(
    controller.subscribe.bind(controller),
    () => controller.getState(),
    () => controller.getState(),
  );

  useEffect(() => {
    if (state.phase === 'authenticated' && state.principal) {
      const accessToken = controller.getAccessToken();
      if (accessToken) {
        establishSession({ accessToken, principal: state.principal });
      }
      router.replace('/dashboard');
    }
  }, [state.phase, state.principal, controller, establishSession, router]);

  if (!enabled) {
    return <DisabledFixtureNotice />;
  }

  if (state.phase === 'authenticated') {
    return null;
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
            ورود کارکنان
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            ایران یراق — ورود امن با رمز عبور و کد تایید دومرحله‌ای
          </Typography>
        </Box>

        {state.phase === 'session-expired' || state.phase === 'forbidden' ? (
          <SessionStatePanel
            phase={state.phase}
            onRetry={() => {
              controller.resetToPassword();
              controller.open();
            }}
          />
        ) : (
          <LoginSteps state={state} controller={controller} />
        )}

        <Box sx={{ mt: 3, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
          <Typography variant="caption" color="text.secondary">
            این نسخه با کلید آزمایشی (`NEXT_PUBLIC_FIXTURE_AUTH=true`) فعال شده و صرفاً برای
            توسعه و آزمایش در دسترس است؛ در استیجینگ و تولید به‌صورت fail-closed غیرفعال می‌شود.
          </Typography>
        </Box>
      </Paper>
    </Box>
  );
}

type SessionStateProps = {
  phase: 'session-expired' | 'forbidden';
  onRetry: () => void;
};

export function SessionStatePanel({ phase, onRetry }: SessionStateProps) {
  const isExpired = phase === 'session-expired';
  return (
    <Box>
      <Alert severity={isExpired ? 'warning' : 'error'} sx={{ mb: 2 }}>
        {isExpired
          ? 'نشست شما به پایان رسیده است. برای ادامه دوباره وارد شوید.'
          : 'دسترسی به پنل عملیات مجاز نیست.'}
      </Alert>
      <Button variant="contained" fullWidth size="large" onClick={onRetry} autoFocus>
        ورود دوباره
      </Button>
    </Box>
  );
}

type StepsProps = {
  state: ReturnType<StaffLoginController['getState']>;
  controller: StaffLoginController;
};

function LoginSteps({ state, controller }: StepsProps) {
  return (
    <form
      onSubmit={event => {
        event.preventDefault();
        void (state.phase === 'totp'
          ? controller.submitTotp()
          : controller.submitPassword());
      }}
      noValidate
    >
      {state.phase === 'totp' ? (
        <TotpStep state={state} controller={controller} />
      ) : (
        <PasswordStep state={state} controller={controller} />
      )}
    </form>
  );
}

export function PasswordStep({
  state,
  controller,
}: {
  state: ReturnType<StaffLoginController['getState']>;
  controller: StaffLoginController;
}) {
  return (
    <>
      <TextField
        label="شناسه"
        type="text"
        autoComplete="username"
        autoFocus
        fullWidth
        value={state.identifier}
        onChange={event => controller.setIdentifier(event.target.value)}
        disabled={state.busy}
        error={state.error !== null}
        inputProps={{ 'aria-label': 'شناسه کارکن' }}
        sx={{ mb: 2 }}
      />
      <TextField
        label="رمز عبور"
        type="password"
        autoComplete="current-password"
        fullWidth
        value={state.password}
        onChange={event => controller.setPassword(event.target.value)}
        disabled={state.busy}
        error={state.error !== null}
        inputProps={{ 'aria-label': 'رمز عبور' }}
        sx={{ mb: 2 }}
      />

      {state.error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {state.error}
        </Alert>
      )}

      <Button type="submit" variant="contained" fullWidth size="large" disabled={state.busy}>
        {state.busy ? 'در حال بررسی…' : 'ادامه'}
      </Button>
    </>
  );
}

export function TotpStep({
  state,
  controller,
}: {
  state: ReturnType<StaffLoginController['getState']>;
  controller: StaffLoginController;
}) {
  const secondsLeft = state.expiresAt !== null
    ? Math.max(0, Math.ceil((state.expiresAt - Date.now()) / 1000))
    : null;

  return (
    <>
      <TextField
        label="کد تایید شش‌رقمی"
        type="text"
        autoComplete="one-time-code"
        autoFocus
        fullWidth
        value={state.code}
        onChange={event => controller.setCode(event.target.value)}
        disabled={state.busy}
        error={state.error !== null}
        inputProps={{ 'aria-label': 'کد تایید شش‌رقمی', dir: 'ltr', inputMode: 'numeric' }}
        sx={{ mb: 2 }}
      />

      {secondsLeft !== null && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }} aria-live="polite">
          کد تایید تا {secondsLeft} ثانیه دیگر معتبر است.
        </Typography>
      )}

      {state.error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {state.error}
        </Alert>
      )}

      <Button type="submit" variant="contained" fullWidth size="large" disabled={state.busy}>
        {state.busy ? 'در حال ورود…' : 'ورود'}
      </Button>
      <Button
        fullWidth
        size="small"
        sx={{ mt: 1 }}
        onClick={() => controller.resetToPassword()}
        disabled={state.busy}
      >
        بازگشت به مرحله اول
      </Button>
    </>
  );
}

/**
 * Shown whenever this build does NOT opt in to the fixture (decision B): the
 * fixture must fail closed in production/ship builds and never render a signed
 * form. This is a stable rendered notice rather than a render-time throw so the
 * `next build` pre-render never breaks — the route still refuses to expose any
 * sign-in form when `NEXT_PUBLIC_FIXTURE_AUTH` is absent or not exactly "true".
 */
export function DisabledFixtureNotice() {
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
        <Alert severity="warning" role="alert">
          ورود کارکنان به‌صورت آزمایشی در این نسخه فعال نیست. برای فعال‌سازی، برنامه باید با
          کلید `NEXT_PUBLIC_FIXTURE_AUTH=true` ساخته شود؛ در استیجینگ و تولید این صفحه به‌صورت
          fail-closed غیرفعال است و فرمی نمایش داده نمی‌شود.
        </Alert>
      </Paper>
    </Box>
  );
}