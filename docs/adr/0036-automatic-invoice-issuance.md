# ADR 0036 — Automatic invoice issuance and publication for paid orders

Status: implementation; deployment and operator acceptance pending.

## Decision

The owner requires that a customer can obtain the store invoice of a purchase
without waiting for a staff member, that earlier paid sales receive theirs too,
and that the customer copy shows no tax.

ADR-0027 and ADR-0028 keep issuance and publication as two audited, idempotent,
actor-attributed commands. They stay exactly that. A separate, default-off
setting adds a *standing authorization*:

- `GET/PUT /api/v1/settings/admin/invoice-automation` (`settings.manage`; PUT
  needs fresh `STAFF_MFA`). Enabling additionally requires that the operator
  personally holds `invoices.read`, `invoices.manage`, `invoices.issue` and
  `invoices.publish`, because the automation acts on that operator's authority.
  Switching it off needs only `settings.manage`.
- The flag lives in `StorefrontFeatureFlag` (`invoice-automation`) with optimistic
  versioning. The enabling operator is taken from the immutable audit entry
  `invoice.automation.updated`; no schema change is needed.
- The worker runs one bounded pass every 30 seconds. For each `PAID` order of an
  `ACTIVE` customer that has no invoice it calls the existing commands in order:
  draft from order, issue, publish. Idempotency keys are deterministic
  (`automation-draft-<order>-v<version>`, `automation-issue-<order>`,
  `automation-publish-<document>`), so repeated, concurrent or restarted passes
  converge on one draft, one invoice and one publication per order.

Earlier sales need no separate back-fill: they are simply paid orders without an
invoice and are picked up oldest first.

## Fail-closed rules

- Off by default. No active approved invoice policy: nothing is drafted or issued.
- The enabling operator must still be an `ACTIVE` user holding all four
  permissions at every pass; otherwise the pass does nothing.
- Only `PAID` orders. Unpaid, cancelled and returned sales are never invoiced by
  the automation, although ADR-0027 lets staff invoice an unpaid sale by hand.
- A policy whose total differs from the order total (a tax added on top) cannot
  issue, exactly as for staff; the order stays pending and is reported in the
  setting's waiting count.
- Staff decisions win: an open staff draft is left alone, a privately
  staff-issued invoice is not published, and an automatic invoice that staff
  revoked is not published again.
- An order that cannot be invoiced is retried with exponential back-off (5
  minutes to 6 hours, process-local) so it cannot starve later orders. Logs carry
  the machine code and the opaque order id only.

No order, payment, stock, receivable or outbox row is written.

## Customer copy

The customer page and the current PDF layout (`store-invoice-a4-v4`) print no tax
column, row, rate or exemption text. The one exception is a stored total that
items, discount and shipping do not explain (a tax added on top): that line is
kept so the printed figures add up. With an `EXEMPT` or `INCLUSIVE` policy it
never appears. Layouts v1–v3 remain reproducible byte for byte.

The order page links to the order's published invoice
(`GET /customers/me/invoices?orderId=`, a filter inside the caller's own
invoices). The invoice page downloads the stored PDF with one action.

Two defects found on the way are fixed here: the PDF request/status endpoints
returned the result unwrapped although the shared contract, the published schema
and the Admin client use `data.pdf`; and the storefront client called the invoice
URL without `/pdf`. Neither PDF panel could work in a browser.

## Acceptance

Real PostgreSQL: default off, earlier and new paid orders, unchanged commerce
evidence, concurrency/restart convergence, resumed publication, staff precedence,
policy/permission/suspension/switch-off refusal, requote after a policy change,
back-off. HTTP: authentication, permissions, fresh MFA, body validation. Unit:
layout, no-tax rule, legacy layout hashes, Admin switch, customer page and order
link. Still required: deployment, the operator enabling the setting with a real
MFA, an approved PDF capacity, and a real customer download.
