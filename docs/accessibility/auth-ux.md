# Accessibility notes — Customer OTP auth UX (#50)

Companion notes for the desktop/mobile screenshots in
[`docs/screenshots/auth/`](../screenshots/auth/) that accompany PR #139.

## Scope

Storefront customer sign-in (`LoginDialog`) and the authenticated account
surface: the two-step OTP flow, resend/expiry timing, invalid-code and
rate-limited recovery states, and silent session restore. Admin login/session
views are out of scope here (see [`admin-auth-sessions.md`](./admin-auth-sessions.md)
for the admin half of #50).

## What was verified

- **Automated:** `e2e/tests/web-a11y.spec.ts` runs `axe-core` on the storefront
  pages (Chrome, desktop + mobile) and asserts zero violations; it also asserts
  the zero-external-runtime-asset gate (all fonts/assets local), so no third-party
  UI framework or icon set leaks in.
- **State-machine E2E** (`e2e/tests/web-auth.spec.ts`): keyboard reachable entry
  points (header "ورود به حساب کاربری" / bottom-nav "پروفایل"), OTP submit,
  invalid-code alert, resend countdown, and the rate-limit lockout with a disabled
  `Retry-After`-style countdown button.
- **Scripted screenshots:** `e2e/scripts/capture-auth-screenshots.mjs`
  (`pnpm --filter @iranyaragh/e2e screenshots`) captures the four states on
  desktop 1440×900 and Pixel 7 (412×915, touch).

## Keyboard and focus

- The dialog opens with focus on the mobile `#login-mobile` input.
- After a successful request the focus moves to `#login-otp-code` and the phase
  announces the code step.
- Required controls are native buttons/inputs: Enter submits the active step,
  Tab keeps focus inside the dialog while it is open, Esc closes it.
- Submit buttons are disabled only while a request/verification is genuinely in
  flight or during the rate-limit countdown; rendering does not silently swallow
  presses.

## Screen reader

- The dialog has an accessible name heading ("ورود با شماره موبایل" /
  "کد تایید را وارد کنید") and `role="dialog"`.
- Errors render as `role="alert"` with distinct Persian copy per state:
  invalid mobile, invalid code, expired code, rate-limited, transport failure —
  so a screen reader user hears why the step did not advance.
- Resend/submit gating is conveyed both by disabled state and by the countdown
  text (`ارسال مجدد (…)`, `تلاش مجدد (…)`).
- Persian readings use the native page `lang`/`dir` (RTL); numbers render as
  Western digits on a Persian label.

## States

| State | Recovery | Evidence |
| --- | --- | --- |
| Invalid mobile | inline alert; retry the field | screenshot `01-mobile-step` |
| Code step | focus + resend countdown (`60s`) | screenshot `02-code-step` |
| Invalid code | inline alert; retry code (challenge survives) | screenshot `03-invalid-code` |
| Expired code | returns to the code step with a "request a new code" message | unit + fixture E2E |
| Rate-limited | disabled button + `Retry-After` countdown; no auto-retry storm | screenshot `04-rate-limited` |
| Session expired/revoked | forced, distinguished re-auth panel; single user action | unit tests (`ui.test.ts`) |

## Contrast, motion and touch

- Interactive elements meet typical AA contrast on the light theme used in the
  screenshots; alerts use both colour and text, never colour alone.
- The app respects reduced motion; no essential information is conveyed only by
  animation.
- Mobile tap targets follow the 8px/44px discipline of the design system
  (bottom-nav and dialog actions).

## Known gaps

- The **session-expired / replay-detected** panel is unit-tested
  (`apps/web/src/state/AuthProvider.test.tsx`, `ui.test.ts`) but not yet
  screenshot-documented; add when a live session fixture exists for E2E.
- Axe covers the DOM states above; manual screen-reader (NVDA/VoiceOver)
  pass-through is pending human QA.