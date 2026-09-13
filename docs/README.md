# Iraniyaragh Documentation Index

Read these documents before implementing business-critical features.

1. `FOUNDATION.md` — mandatory engineering rules and Definition of Done.
2. `ARCHITECTURE.md` — system shape, domains and scale path.
3. `COMMERCE_AND_INVENTORY.md` — product, pricing, warehouse, stock and order rules.
4. `SECURITY.md` — authentication, RBAC, audit, secrets and payment safety.
5. `API_STANDARDS.md` — API conventions, validation, errors and idempotency.
6. `AUTH_CONTRACT.md` — authenticated HTTP surface, session/CSRF contract, rate
   limits, audit events and client-state rules.
7. `OPERATIONS.md` — environments, CI/CD, migrations, monitoring and queues.
8. `SMS_PROVIDER_OPERATIONS.md` — SMS.ir provider runbook and the environment-backed
   settings projection.
9. `TESTING.md` — test layers, isolated database safety and local/CI commands.
10. `ROADMAP.md` — release-level implementation order.
11. `PROJECT_STATUS.md` — honest inventory of what exists today and known gaps.
12. `DEVELOPMENT_PLAN.md` — MVP scope, two-person sprint backlog and release gates.
13. `COLLABORATION.md` — ownership, GitHub flow, hand-offs and conflict prevention.
14. `PRODUCT_SPEC.md` — end-to-end functional and non-functional product specification.
15. `PRODUCT_MEDIA_SPEC.md` — accepted image/video media contract and its M1–M5 runtime
    slices.
16. `CATALOG_ATTRIBUTES_SPEC.md` — accepted product attributes/variants/import
    workbook contract and staged import flow.
17. `CATALOG_IDEMPOTENCY.md` — durable Catalog mutation-idempotency contract.
18. `EXECUTION_BACKLOG.md` — zero-to-production work breakdown, dependencies and owners.
19. `TEAM.md` — team identities, proposed ownership and onboarding agreement.
20. `ADMIN_PANEL_PLAN.md` — production admin information architecture, shared UX,
    security, verification and phased completion gates.
21. `V1_MASTER_PLAN.md` — detailed dependency-ordered V1 checklist, acceptance gates
    and open decision register.
22. `EXECUTION_STATUS.md` — current review queue, next ten working days and handoffs.
23. `adr/` — architecture decisions that intentionally change or extend the foundation.
24. `SEO_GEO_AI_DISCOVERY_PLAN.md` — dynamic sitemap, technical SEO, commerce
    structured data, AI-answer discovery, on-site AI controls and delivery workflows.
25. `COMMERCE_EXPANSION_PLAN.md` — authoritative end-to-end expansion plan covering
    all commerce capabilities, dependency gates, two-contributor ownership,
    implementation methods, quality evidence, production readiness and governed growth.
26. `AGENT_WORKSTREAMS.md` — independent Platform, Admin and User UI ownership,
    shared-hotspot collision controls and integration handoffs.
27. `PAGE_RELEASE_MATRIX.md` — complete dynamic customer/admin page inventory,
    responsive purchase contract and 1.0.0/1.1.0 provider boundary.
28. `OBSERVABILITY_CONTRACT.md` — diagnostic event schema, privacy/redaction
    limits, audit separation and phased logging/telemetry boundary.
29. `accessibility/` — accessibility review notes (auth UX, admin sessions).

When code and documentation disagree, stop and resolve the discrepancy. Do not silently bypass a documented invariant.
