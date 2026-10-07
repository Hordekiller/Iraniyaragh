'use client';

import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle } from '@mui/material';
import { useAuth } from '@/lib/auth/AuthProvider';
import { StaffAuthHttpClient } from '@/lib/auth/staff-http';
import { StaffLoginController } from '@/lib/auth/staff-login';
import { createMemoryStaffTokenStore } from '@/lib/auth/token-store';
import { LoginSteps, SessionStatePanel } from './StaffLoginSteps';

/** Reuses the real password/TOTP flow; no fixture, token persistence or mutation replay. */
export function FreshAuthenticationDialog() {
  const { reauthenticate, dismissFreshAuthentication } = useAuth();
  const controller = useMemo(() => {
    const store = createMemoryStaffTokenStore();
    const http = new StaffAuthHttpClient({ store });
    const created = new StaffLoginController({
      passwordRequest: payload => http.passwordRequest(payload),
      totpVerify: async payload => {
        let verified: Awaited<ReturnType<StaffAuthHttpClient['totpVerify']>> | undefined;
        await reauthenticate(async () => {
          verified = await http.totpVerify(payload);
          return verified;
        });
        if (!verified) throw new Error('تأیید دومرحله‌ای کامل نشد.');
        return verified;
      },
      me: () => http.me(),
      logout: () => http.logout(),
    }, store);
    created.open();
    return created;
  }, [reauthenticate]);
  const state = useSyncExternalStore(controller.subscribe.bind(controller), () => controller.getState(), () => controller.getState());
  useEffect(() => () => { controller.close(); }, [controller]);

  return (
    <Dialog open onClose={state.busy ? undefined : dismissFreshAuthentication} aria-labelledby="fresh-auth-title" maxWidth="xs" fullWidth>
      <DialogTitle id="fresh-auth-title">تأیید مجدد عملیات حساس</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>
          نشست شما منقضی نشده است. با همان حساب، رمز عبور و کد دومرحله‌ای را تأیید کنید؛ سپس عملیات را خودتان دوباره ارسال کنید. اطلاعات فرم در همین صفحه باقی می‌ماند.
        </DialogContentText>
        {state.phase === 'session-expired' || state.phase === 'forbidden'
          ? <SessionStatePanel phase={state.phase} onRetry={() => controller.recoverToPassword()} />
          : <LoginSteps state={state} controller={controller} />}
      </DialogContent>
      <DialogActions><Button onClick={dismissFreshAuthentication} disabled={state.busy}>فعلاً انصراف</Button></DialogActions>
    </Dialog>
  );
}
