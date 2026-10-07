# Customer purchase and account pages

## Reconciliation

Baseline: main `32a6323be72a86f96c165e83e5d36707fed83dca`.

The existing main already contains the real Guest Cart, Checkout, customer-self
profile/address APIs, owned order history/detail, payment result and session
management. These implementations are retained. `/privacy` and `/terms`, with
the shared legal-document layout, were present only in the unmerged
`lane-b/storefront-completion` commit
`9be35395d79f446a5ce480f37bcbc90a5b7b688f`.

The legal pages reuse that work with current contracts and verified configuration.
The old branch's local-cart wording and synthetic supplier address/phone are not
valid for today's server-held Guest Cart. No whole-branch cherry-pick or historical
commerce/auth replacement is needed.

## Reachable paths

- Footer: account, cart, privacy and terms.
- Mobile navigation: cart and account entry points.
- Account navigation: profile, paginated owned orders, address book, active sessions, cart.
- Checkout: owned saved-address picker, retry and manual address entry, account
  address management, terms and privacy links before order submission.

Profile/address reads and mutations use only `/api/v1/customers/me` and
`/api/v1/customers/me/addresses`. Ownership remains enforced by the API. Money,
shipping quotes, stock reservations, checkout keys and payment states remain
under their existing server contracts.

Account editors mount per authenticated principal. Initial silent restoration
has an explicit loading state. Drafts are locked during mutations; a synchronous
latch rejects repeated submits. An uncertain result retains the exact payload,
expected version and idempotency key for an explicit retry. A version conflict
requires the user to fetch the current version while preserving the draft, review
it, and submit again. Loading stored data instead explicitly confirms discarding
unsaved changes. Raw error bodies are never rendered.

Address deletion preserves the surviving default, chooses the first remaining
address if the default was removed, and supports an empty address book. The API
remains authoritative for the exactly-one-default invariant and address ownership.
The profile DTO now accepts nullable name fields exactly as the existing public
OpenAPI/TypeScript contract promises; non-string values remain rejected.
Changing a saved address does not change historical order snapshots.

## Acceptance boundaries

Unit regressions cover owned-route calls, version/key behavior, same-request
retry, repeated submit, conflict recovery, default deletion, principal changes,
sanitized failure UI and saved-address retry preserving checkout input.
Browser coverage visits legal and account entry routes with fixture authentication
and catalogue disabled, including direct reload, navigation, metadata and
accessibility. Existing purchase tests continue to require a pending-payment
order and an unavailable gateway to remain unpaid.

These are not substitutes for a real customer OTP session and provider payment
acceptance. Staging has independently gated SMS.ir and payment activation. This
release does not change either provider mode, seed data, or simulate a payment.

Business-owner contact information, price/offer validity, return/cancellation and
warranty policies remain explicitly pending until the owner supplies approved
content. Privacy export/closure has no customer backend contract and is not
presented as available. Issue #389 cannot be closed solely on these page changes;
#114 and payment-provider acceptance remain independent dependencies.
