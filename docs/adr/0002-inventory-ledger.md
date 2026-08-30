# ADR-0002: Ledger-Based Inventory

Status: Accepted

## Decision
Iraniyaragh inventory uses SKU + warehouse/location balances together with an immutable inventory movement ledger and explicit reservations.

## Reason
A single mutable `stock` field cannot safely support multiple warehouses, reservations, transfers, stocktakes, returns, purchasing and auditability.

## Consequences
All physical quantity changes must go through inventory services and produce ledger movements. Direct arbitrary stock edits are prohibited.
