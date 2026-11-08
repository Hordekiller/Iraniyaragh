# Iraniyaragh Documentation Index

Current entry points (2026-11-07): [current state](CURRENT_STATE.md),
[documentation maintenance](DOCUMENTATION_MAINTENANCE.md), [V1 reconciliation](V1_RECONCILIATION.md),
[project status](PROJECT_STATUS.md), [issue register](V1_ISSUE_REGISTER.json),
[dependency gates](V1_DEPENDENCIES.json) and [repository workflow](REPOSITORY_WORKFLOW.md).
The issue/branch/dependency JSON registers are dated reconciliation snapshots,
not live GitHub or VPS status. Preserve their recorded history.
[ADR-0034](adr/0034-v1-dependency-upgrade-freeze.md) records the current dependency
freeze. SECURITY.md and FOUNDATION.md retain domain/data-safety invariants.
Older sprint, ownership and parallel-agent plans are historical context.

1. `FOUNDATION.md` — existing architecture and money/inventory/order safety invariants.
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
12. `DEVELOPMENT_PLAN.md` — historical sprint scope and release-gate context.
13. `COLLABORATION.md` — historical ownership and GitHub-flow reference.
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
30. `MEDIA_M5_EVIDENCE.md` — verified product-media M4 storefront gallery and M5
    publish-to-discovery evidence, plus the open contract gaps.

The current user instruction decides scope and order. Never silently bypass a
security, money, inventory or payment invariant because a roadmap is stale.

- [سفارش ساخت درب](CUSTOM_DOOR_ORDERS.md) — معماری پیاده‌شده، پرداخت کامل مبلغ نهایی، مشخصات ساخت، انبار، مدیریت، API و استقرار.
- [شواهد اعتبارسنجی سفارش ساخت](CUSTOM_DOOR_VALIDATION.md) — نتایج واقعی تست و مرز پذیرش production.

- `PROMOTIONS.md` — coupons/campaigns: model, redemption lifecycle, deployment and rollback.

- [Governed blog](BLOG.md) — article lifecycle, permissions, images, RSS and rollout.
- [Customer reviews](REVIEWS.md) — verified-purchase reviews, moderation, aggregates and structured data.
- [Session recovery](ADMIN_SESSION_RECOVERY.md) — realm split, bounded recovery and reauthentication.
- [Newsletter and public test-article plan](NEWSLETTER_PLAN_FA.md) — planned scope and activation gates.
- [راهنمای فارسی MCP](../MCP_GUIDE_FA.md) — local Codex/Claude tools and shared handoff.
