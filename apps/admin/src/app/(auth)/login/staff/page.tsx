'use client';

import { useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { LoginSteps, SessionStatePanel } from '@/components/auth/StaffLoginSteps';
export { PasswordStep, TotpStep, SessionStatePanel } from '@/components/auth/StaffLoginSteps';
import { useSyncExternalStore } from 'react';
import { AuthSurface } from '@/components/auth/AuthSurface';
import { AuthTransition } from '@/components/auth/AuthTransition';
import { useAuth } from '@/lib/auth/AuthProvider';
import { isFixtureAuthEnabled } from '@/lib/auth/staff-fixture-guard';
import { createStaffAuth } from '@/lib/auth/staff-http';
import { StaffLoginController } from '@/lib/auth/staff-login';
import { createMemoryStaffTokenStore } from '@/lib/auth/token-store';

/**
 * Staff sign-in (admin login slice, #50).
 *
 * `/login` is the canonical operational entry point and `/login/staff` remains
 * a backwards-compatible alias. The real
 * `StaffAuthHttpClient` against `/auth/staff/password` -> `/auth/staff/totp/verify`
 * is the default (parallel-work handoff, AUTH_CONTRACT §17); the deterministic
 * fixture is the only data source when `NEXT_PUBLIC_FIXTURE_AUTH=true` is baked
 * into the build (local dev / e2e, decision B). Refresh and fresh-MFA recovery are handled by the app-wide AuthProvider.
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
    const store = createMemoryStaffTokenStore();
    const { api } = createStaffAuth(store);
    const created = new StaffLoginController(api, store);
    created.open();
    return created;
  }, []);
  const state = useSyncExternalStore(
    controller.subscribe.bind(controller),
    () => controller.getState(),
    () => controller.getState(),
  );

  useEffect(() => {
    if (state.phase === 'authenticated') {
      const accessToken = state.principal ? controller.getAccessToken() : null;
      // Fail closed: an authenticated phase without a recoverable token never
      // reaches the shell — degrade into the recoverable password step instead
      // of navigating unauthenticated to /dashboard.
      if (!state.principal || !accessToken) {
        controller.recoverToPassword('نشست تایید نامعتبر است. دوباره وارد شوید.');
        return;
      }
      establishSession({ accessToken, principal: state.principal });
      router.replace('/dashboard');
    }
  }, [state.phase, state.principal, controller, establishSession, router]);

  if (state.phase === 'authenticated') {
    return <AuthTransition title="تأیید دومرحله‌ای کامل شد" description="در حال انتقال امن به داشبورد عملیات هستید." />;
  }

  return (
    <AuthSurface
      title="ورود کارکنان"
      description="با شناسه، رمز عبور و کد تأیید دومرحله‌ای وارد مرکز عملیات شوید."
      footer={
        enabled
          ? 'حالت fixture فقط با پرچم صریح توسعه/آزمایش فعال است؛ استیجینگ و تولید همیشه از سرور واقعی استفاده می‌کنند.'
          : 'ورود، نشست و سطح دسترسی از سرور احراز هویت واقعی دریافت می‌شود.'
      }
    >
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
    </AuthSurface>
  );
}
