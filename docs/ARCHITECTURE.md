# Iraniyaragh Platform Architecture

## Goal
Build a startup-ready commerce platform that can launch cheaply as a modular monolith and scale without a rewrite.

## Applications
- `apps/web`: customer storefront. Current React/Vite UI is preserved here as the visual baseline; migrate route-by-route to Next.js when commerce flows are wired.
- `apps/admin`: operational backoffice for catalog, warehouse, orders, accounting, support, content and reports.
- `apps/api`: NestJS modular monolith. One source of business truth for web, app and admin.
- Mobile app is planned as React Native + Expo after API contracts stabilize.

## Core domains
1. Identity & access: OTP customers, admin passwords/2FA, RBAC.
2. Catalog: product, variant/SKU, brand, category, attributes, media, SEO.
3. Pricing: sale price, price lists, discounts, campaigns.
4. Inventory: warehouses, balances, immutable movements, reservations, transfers, stocktakes.
5. Commerce: cart, checkout, orders, returns.
6. Payments: attempts, verification, refunds, idempotency.
7. Fulfillment: shipment, tracking, delivery.
8. Customer: profile, addresses, wishlist, reviews.
9. Operations: audit log, notifications, support, analytics.

## Inventory invariants
- SKU is the atomic sellable inventory unit.
- `available = onHand - reserved` is maintained transactionally.
- Every physical quantity change produces an `InventoryMovement` ledger record.
- Orders reserve stock before fulfillment; reservations expire or are consumed/released.
- Repeated external callbacks/commands use idempotency keys.
- Transfers are explicit state machines, never direct balance edits.
- Manual corrections require a reason and an audit record.
- Negative stock is forbidden unless a future explicit business rule enables backorders.

## Runtime architecture (MVP)
Cloudflare -> Docker host -> Web/Admin/API/Worker -> PostgreSQL + Redis -> S3-compatible object storage.

Start on one Iranian VPS if budget is constrained, but keep backups and object storage independent. Separate PostgreSQL first when load or business criticality increases.

## Scale path
1. MVP: one application node, Postgres, Redis.
2. Growth: separate DB, workers, object storage/CDN.
3. Scale: multiple stateless API/web nodes behind load balancer; Redis-backed queues/locks.
4. High scale: split only proven hot domains (search, notifications, reporting) into services.

## Engineering rules
- TypeScript strict mode.
- Database migrations are code-reviewed.
- Money uses decimal/integer-safe representations, never JS floating point for accounting.
- API is versioned under `/api/v1`.
- DTO validation at every external boundary.
- Structured error codes, logs and correlation IDs.
- No business logic in controllers or UI components.
- CI must run lint, typecheck, tests and build before deploy.

## Warehouse model
The warehouse subsystem is location-aware rather than treating stock as one number per product.

- `Warehouse` is a physical warehouse/branch.
- `WarehouseLocation` represents zone/aisle/rack/shelf/bin positions.
- `InventoryBalance` is keyed by warehouse + location + SKU.
- `InventoryMovement` is the immutable stock ledger and records every on-hand change.
- `StockReservation` holds sellable stock for checkout/orders without silently changing on-hand.
- `StockTransfer` is the controlled state machine for warehouse-to-warehouse movement.
- `Supplier` and `PurchaseOrder` form the inbound procurement foundation.
- `Stocktake` captures cycle counts and full inventory counts before controlled adjustments.

The service layer uses serializable database transactions for critical inventory mutations. Negative available stock is rejected by default, and idempotency keys are supported on movement commands.
