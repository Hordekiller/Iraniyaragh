# Payment deadline recovery — #450

This source slice guards the existing Web payment page using the customer-owned
`OrderDetail.reservationExpiresAt` contract. It does not change the backend's
authoritative payment eligibility check, reservation duration, payment states,
gateway configuration or customer ownership rules.

- A due or malformed reservation deadline prevents a new initiation action.
- One deadline timer updates an idle page; focus/visibility events refresh the
  observed clock. No API polling is added. Timers/listeners are removed on cleanup.
- The click handler checks the clock again to cover a suspended browser tab.
- An initiation response arriving after the deadline is retained as uncertain;
  it does not trigger a redirect, second initiation or cancellation.
- An existing pending/uncertain payment is not labelled failed or refunded.
  Explicit refresh uses the same owned order read; the existing idempotency key
  and uncertainty lock remain intact.
- An authoritative PAID order plus PAID payment still displays success after its
  historical reservation deadline. Conflicting financial states require review.
- A cancelled order without a pending/paid attempt has a specific cancelled state
  and a detail link, without a new payment action or refund claim.

Client time is a UX guard, not financial or authorization evidence. The API
remains authoritative. Tests use a controlled clock around the existing fixture
deadline instead of moving fixture dates into the future or extending production
timeouts. New tests cover the exact boundary, idle/focus/click recovery, malformed
deadline, pending-attempt reload, late response, historical paid state and
cancelled unpaid state. Test results are not live-provider acceptance.

#450 remains OPEN: trusted background identity, payment-aware automatic order
expiry, bounded maintenance scheduling and live stock-release acceptance are
separate work. Neither #451's batching nor this Web slice activates a sweeper.
No deployment, financial mutation or live-data fixture is part of this slice.
