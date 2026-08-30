# Team, Ownership and Onboarding

Last updated: 2026-08-30

## Members

| Member | Proposed track | Repository role | Status |
| --- | --- | --- | --- |
| [@Hordekiller](https://github.com/Hordekiller) | Developer A — Platform/API/Data/Operations | Owner/release driver | Active |
| [@Maddyrampant](https://github.com/Maddyrampant) | Developer B — Product/Web/Admin/E2E | Write collaborator/reviewer | Active; onboarding review complete |

Onboarding response is now complete. Maddyrampant reports approximately 35 hours
per week in Iran time, normally same-day communication and a maximum one-working-day
review target. Hordekiller's weekly capacity still needs to be recorded before the
first sprint is committed; sprint scope must use the lower real capacity, not the
headline roadmap estimate.

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

## Onboarding response required from Maddyrampant

Maddyrampant has accepted the repository invitation and should now reply to the
GitHub onboarding issue with a complete independent assessment. Copy this structure:

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

## Working agreement to finalize

- Weekly capacity for each person
- Sprint start/end day and demo time
- Review response target (proposed: one working day)
- Urgent blocker/incident communication channel
- Password manager and secret-sharing method
- Staging/production access policy
- Release authority and emergency rollback authority
- Definition of working hours and expected asynchronous response

Never place private phone numbers, credentials or production access details in the
repository. Record only the process and use an approved private channel for secrets.

## Knowledge continuity

- Every critical module has a primary implementer and second-person reviewer.
- ADRs explain durable decisions; runbooks explain operations.
- Each sprint includes at least one walkthrough of the other track's work.
- No production process may depend on undocumented knowledge held by one person.
- If one member is unavailable, the other must still be able to deploy, roll back,
  restore a backup and diagnose a critical order/payment/inventory incident.
