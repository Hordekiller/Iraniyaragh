# Team, Ownership and Onboarding

Last updated: 2026-09-13

## Current working item — RBAC and financial-policy governance (2026-09-13)

A documentation-only proposal is under review on branch
`audit/rbac-financial-policy-config`: **ADR-0014** and
`docs/RBAC_AND_FINANCIAL_GOVERNANCE.md`. It audits the current RBAC and
money/financial-policy state, records the Iranian legal baseline (Electronic
Commerce Law 1382, permanent VAT Law 1400 with the 10 % budget rate, and
پایانههای فروشگاهی و سامانه مؤدیان 1398), and specifies what must be
admin-configurable (roles/permissions/approved actions; VAT rates, discount and
refund thresholds, seller legal block) with a G1–G8 slice plan. Owner and
proposed author: `@Hordekiller`; independent required reviewer: `@Maddyrampant`.
No `schema.prisma` change may merge before this ADR is accepted.

## Members

| Member | Proposed track | Repository role | Status |
| --- | --- | --- | --- |
| [@Hordekiller](https://github.com/Hordekiller) | Developer A — Platform/API/Data/Operations | Owner/release driver | Active |
| [@Maddyrampant](https://github.com/Maddyrampant) | Developer B — Product/Web/Admin/E2E | Write collaborator/reviewer | Active; onboarding review complete |

Onboarding response is now complete. Maddyrampant reports approximately 35 hours
per week in Iran time, normally same-day communication and a maximum one-working-day
review target. Hordekiller commits approximately 40 hours per week with
Asia/Tehran-friendly evening overlap, same-day normal responses and urgent blocker
responses within a few waking hours. Sprint scope uses the lower 35-hour capacity.

This ownership is a starting proposal, not a statement about either person's
ability. Change it after the onboarding response if skills, interest or weekly
capacity indicate a better split.

## Shared mission

Build Iraniyaragh into a production-operable commerce and warehouse platform in
which catalog, price, inventory, order and payment behavior is trustworthy and
traceable. Both members own production quality; neither track may treat the other
as an external customer or throw work over the wall.

## Proposed accountable ownership

### Hordekiller — Developer A

- NestJS application/domain services and public/admin APIs
- Prisma schema, migrations, constraints and seed strategy
- Identity/RBAC enforcement, inventory/order/payment correctness
- Redis/BullMQ, object storage, infrastructure, CI/CD and observability
- API integration tests, concurrency/idempotency tests and runbooks
- Initial release-driver role

### Maddyrampant — Developer B

- Product discovery and customer/admin experience
- Web architecture, routes, components, state and API client integration
- Admin operational workflows and accessibility/responsive behavior
- Contract fixtures, browser E2E, visual regression and UAT material
- SEO/content/performance and operator-facing documentation
- Initial release-verifier role

### Joint approval

Both must approve product scope, public contracts, database migrations, security,
inventory/financial state transitions, production release and rollback decisions.
Release roles rotate after the first release.

Shared contracts, OpenAPI compatibility/drift checks and API integration fixtures
are joint ownership. Developer A leads API generation and persistence correctness;
Developer B verifies consumer fixtures and integration behavior against the accepted
contract.

## Accepted working agreement — issue #78

Effective: 2026-09-11. The first two-week sprint starts on the next agreed Saturday
after this document merges; the exact demo clock time is confirmed privately.

- Capacity: Hordekiller 40 hours/week; Maddyrampant 35 hours/week. Milestones are
  sized against the lower 35-hour capacity, not the combined headline estimate.
- Cadence: two-week sprints, starting Saturday in `Asia/Tehran`; the demo is held on
  Friday of the second sprint week. The exact clock time is confirmed privately
  before each sprint and is not a repository dependency.
- Review: one working day is the normal review-response target.
- Urgent blockers/incidents: use the private team channel; repository documents
  record only the process and never personal contact details.
- Secrets: use an approved password manager such as Bitwarden or 1Password;
  credentials never enter GitHub, chat, `.env.example` or repository history.
- Access: both members have staging implementation/reviewer access; production
  writes and secret-manager administration are least-privilege and release-driver
  controlled. Both retain non-secret health/diagnostic verification access.
- Release: first release driver is Hordekiller and verifier is Maddyrampant; roles
  rotate after the first release. Either member may execute an emergency rollback,
  with an after-action record and independent verification afterward.
- Continuity: every critical production procedure has a primary implementer and a
  second-person reviewer; no release or rollback depends on undocumented knowledge.

## Onboarding response from Maddyrampant — complete

Onboarding review is complete. The template below is retained as a reference
for future contributors.

```markdown
## My understanding of the product
[Explain the business, users, critical journeys and source of truth in your words.]

## Current repository assessment
[What is implemented, partial, missing, risky or inconsistent?]

## Skills and preferred ownership
- Strongest areas:
- Areas I can review confidently:
- Areas where I need pairing/research:
- Proposed changes to the A/B split:

## Availability and working agreement
- Hours/days per week:
- Typical response/review window:
- Planned unavailable dates:
- Preferred communication and meeting times/timezone:

## Proposed architecture/product changes
[List each suggestion, reason, cost, risk and whether it needs an ADR.]

## MVP scope critique
- Missing essentials:
- Items that should be deferred:
- External dependencies/decisions:

## First two sprints
[Provide a concrete task order, dependencies, estimates and acceptance evidence.]

## Top risks
[At least five risks with mitigations.]

## Questions and decisions needed
[Business, product, provider, infrastructure and policy questions.]

## Commitment
[Confirm the agreed branch/PR/review/DoD/security rules or propose explicit edits.]
```

The goal is independent reasoning, not a one-word approval. Hordekiller responds to
each proposed change; accepted changes are reflected in docs/issues/ADRs.

## Finalized working-agreement reference

Capacity, cadence, review response, urgent communication, secret sharing, access,
release/rollback authority and asynchronous-response expectations are binding as
recorded in the accepted agreement above. Future changes require an explicit dated
team decision; they must not be inferred from availability in a single sprint.

Never place private phone numbers, credentials or production access details in the
repository. Record only the process and use an approved private channel for secrets.

## Knowledge continuity

- Every critical module has a primary implementer and second-person reviewer.
- ADRs explain durable decisions; runbooks explain operations.
- Each sprint includes at least one walkthrough of the other track's work.
- No production process may depend on undocumented knowledge held by one person.
- If one member is unavailable, the other must still be able to deploy, roll back,
  restore a backup and diagnose a critical order/payment/inventory incident.
