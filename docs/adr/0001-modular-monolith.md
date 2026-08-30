# ADR-0001: Start as a Modular Monolith

Status: Accepted

## Context
Iraniyaragh needs rapid startup delivery while preserving clear commerce, inventory and operational boundaries.

## Decision
Use a NestJS modular monolith with explicit domain modules and one primary transactional PostgreSQL database initially.

## Consequences
- Faster delivery and simpler transactions/operations than premature microservices.
- Domain boundaries must still be respected in code.
- A hot domain may be extracted later only when operational evidence justifies it.
