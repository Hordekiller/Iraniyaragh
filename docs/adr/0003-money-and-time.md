# ADR-0003: Money and Time Representation

Status: Accepted

## Decision
- Money is persisted/calculated using integer-safe representation; JavaScript float arithmetic is forbidden for accounting values.
- Timestamps are stored in UTC and localized only at presentation/reporting boundaries.

## Consequences
UI may display تومان and Jalali dates, but persistence/business calculations remain explicit and unambiguous.
