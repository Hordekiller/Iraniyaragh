# Accessibility notes — Admin session & device management (#50)

Companion notes for the desktop/mobile screenshots in
[`docs/screenshots/admin-sessions/`](../screenshots/admin-sessions/) that
accompany the admin session-management panel (#50, route `/settings/sessions`).

## Scope

The staff-facing session/device-management surface: the live session list, the
per-device revoke dialog, and the logout-all dialog, on desktop (1440×900) and
mobile (Pixel 7). This is the admin half of the #50 evidence; the storefront
customer OTP surface is documented separately in
[`auth-ux.md`](./auth-ux.md).

## What was verified

- **Behavioral E2E** (`e2e/tests/admin-sessions.spec.ts`, desktop + mobile):
  lists active sessions through the real API without the fixture banner,
  revoking the current device signs the operator out to `/login`, and logout-all
  revokes every session and lands on `/login`.
- **Unit/component coverage** (`apps/admin/src/lib/auth/__tests__/` + component
  tests): the page model (single-flight in-flight guard, `require-reauth`
  escalation, revoke/logout-all outcomes), the fail-closed fixture selector, and
  the error taxonomy (network / session-invalid / re-authentication / forbidden /
  not-found / unknown rendered as distinct recoverable states — see the
  surface for each in States).
- **Scripted screenshots** (`e2e/scripts/capture-admin-sessions-screenshots.mjs`):
  the committed PNGs were captured against the **live dev admin** (API up with
  `AUTH_DEV_CODE` + seeded dev admin, exactly like the e2e target). The same
  states are reproducible deterministically in fixture mode without the API:

  ```bash
  pnpm --filter @iranyaragh/e2e screenshots:admin-sessions
  ```

## Keyboard and focus

- Load failures and the re-authentication-required state render as a distinct,
  non-modal **panel** (`EmptyState`) with an explicit «تلاش مجدد» retry button —
  they never silently swallow the operator's intent and never look like a
  working-but-frozen page.
- A **re-authentication-required** state (the session behind the page's API
  calls is revoked while the operator is on the page) shows a distinguished
  single-action recovery panel («ورود مجدد به پنل», which reuses the login
  affordances) instead of a dead page.
- The confirm dialogs are standard MUI dialogs: focus moves into the dialog on
  open, Tab stays inside, Esc closes without acting, and the destructive action
  is a clearly-labelled separate button (`data-testid="session-confirm-button"`);
  the per-device revoke button is disabled only while that specific request is
  genuinely in flight.
- The page title is a real heading (page header matches the sidebar entry
  «نشست‌ها و دستگاه‌ها», asserted via `getByRole('heading')`), so the aural
  landing cue matches where the operator navigated.

## Screen reader

- Each device row exposes the device name, an «این دستگاه» (this device) chip
  for the current sign-in, and the action button labelled `خروج از دستگاه
  <device>` (per-device revoke) — the semantics travel with the row, not an
  ambiguous icon button.
- List actions report their outcome for assistive tech: async success/empty
  transitions use the FeedbackProvider snackbar (`aria-live`); the load-error
  and re-auth panels are stable page content, not interrupts.
- Persian readings use the natural page `lang`/`dir` (RTL); timestamps render
  via `Intl.DateTimeFormat('fa-IR')` on Western digits inside the Persian label.

## States captured

| State | UI | Evidence |
| --- | --- | --- |
| Live session list | current-device chip + per-row revoke + logout-all | `*-01-session-list` |
| Single-device revoke | confirm dialog (`خروج از «…»`) | `*-02-revoke-dialog` |
| Logout-all | confirm dialog; success signs the operator out to `/login` | `*-03-logout-all-dialog` |
| Re-authentication required | distinguished forced re-auth panel | unit tests |
| Load failure (network / forbidden / unknown) | error panel with «تلاش مجدد» | unit tests |

## Contrast, motion and touch

- Destructive actions are red-outlined/filled with text labels on the light
  theme of the screenshots (both symbolic and text, never colour alone);
  interactive elements follow the design-system AA contrast targets.
- The app respects reduced motion; the panel adds no essential animation.
- The mobile layout stacks device cards vertically with full-width action rows,
  matching the 8px/44px touch discipline of the admin design system.

## Known gaps

- The **re-authentication-required** live-path E2E (revoking the *other* live
  device of a two-session operator) is not yet scripted; the state is unit-tested
  and the recovery panel reuses the login affordances exercised by the fixture
  login flow.
- Axe is not yet in the admin e2e matrix; a manual screen-reader (NVDA/VoiceOver)
  pass-through of the session panel is pending human QA.