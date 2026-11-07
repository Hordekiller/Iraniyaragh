# Customer product reviews

Verified-purchase star ratings and written reviews, moderated by staff.

## Rules (enforced on the server)
- Only an authenticated, active customer with a **DELIVERED** order (fulfillment status) containing the product may review it. The proof order id is stored on the review.
- One review per customer per product (`@@unique([productId, customerId])`). Customers can edit their own review; an edit returns it to `PENDING` and removes the staff reply that answered the old text. A `HIDDEN` review cannot be edited by its author.
- Statuses: `PENDING → APPROVED | REJECTED`, `REJECTED/HIDDEN → APPROVED`, `APPROVED → HIDDEN`. Reject and hide require a reason, shown to the author. Only `APPROVED` reviews are public, counted and used in structured data.
- Text is plain text only: no HTML, links, e-mail addresses or phone numbers; rating is an integer 1–5; body 10–2000 characters.
- Public pages show first name + last initial, never a mobile number.
- Every write is idempotent (`Idempotency-Key`), version-checked (`expectedVersion`) and audited (`review.created|edited|approve|reject|hide|replied|reply_removed`).
- Staff permissions: `reviews.read`, `reviews.moderate` (fresh MFA for writes). Grant them to the intended roles with the RBAC baseline.

## Surfaces
- API: `GET /api/v1/reviews/products/:slug` (public), `GET|POST /reviews/products/:slug/me` / `POST`, `PUT /reviews/mine/:id` (customer), `/reviews/admin*` (staff).
- Admin: *نظرات مشتریان* (`/reviews`) — moderation queue, approve / reject / hide, store reply.
- Storefront: product page section with summary, sort, pagination, composer. `Product` JSON-LD gets `aggregateRating` and up to five `review` entries only when approved reviews exist.

## Also covered
- Listing cards show the rating through `GET /reviews/summaries?ids=` (best effort; no rating is shown if the service fails).
- In-app notices: the author is told when a review is approved, rejected, hidden or answered (never containing review text beyond the moderator's reason); moderators get a notice for each new or edited review.
- Rate limit: 10 review writes (create + edit) per customer per hour in Redis, fail-closed (429 / 503).
- `reviews.integration-spec.ts` runs the migration-backed flow on real PostgreSQL (eligibility from a DELIVERED order, idempotent replay, moderation, reply, edit-resets, CHECK constraints).

## Operational notes
- Grant `reviews.read` / `reviews.moderate` to roles with `pnpm --filter api rbac:baseline` and the role-management UI.
- SMS for review events is intentionally not sent; add it through the outbox/SMS-template path only after the controlled SMS acceptance gate passes.
