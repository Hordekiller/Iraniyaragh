'use client';

import { Alert, Box, Button, TextField, Typography } from '@mui/material';
import type { StaffLoginController } from '@/lib/auth/staff-login';

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

export function LoginSteps({ state, controller }: StepsProps) {
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
        helperText="رمز عبور باید بین ۱۵ تا ۱۲۸ نویسه باشد."
        slotProps={{ htmlInput: { 'aria-label': 'رمز عبور', maxLength: 128 } }}
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
