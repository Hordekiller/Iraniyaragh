# ADR-0021: Self-Hosted S3 Object Storage Provider (RustFS)

Status: Accepted — MinIO is replaced by RustFS as the self-hosted S3
implementation; the application's S3 contract is unchanged.

Date: 2026-10-01

## Context

The deployment work needed a self-hosted S3-compatible object store for product
media. The previous choice was MinIO, reached through the compose files in
`infrastructure/docker`.

MinIO's upstream image now requires registry authentication for anonymous pulls.
On a fresh host, and for a developer starting the stack from a clean checkout,
`docker compose pull` fails before the stack can start. That makes the platform
unusable exactly when it is needed: a clean provisioning run, or a new machine.

The blocker is a property of how the image is *distributed*, not of the S3 API
the application speaks. The application layer never referenced MinIO by name: it
speaks plain S3 over generic `OBJECT_STORAGE_*` variables through a
provider-neutral adapter, with path-style addressing, and RustFS implements the
same API.

## Decisions

### Provider choice, confined to infrastructure

- Use **RustFS**, pinned to `rustfs/rustfs:1.0.0`, in both
  `infrastructure/docker/docker-compose.yml` and
  `infrastructure/docker/compose.staging.yml`. Pinned by exact release, not by a
  floating tag, so an image swap cannot silently change storage behaviour.
- The swap stays in the infrastructure layer. The application keeps the same
  generic `OBJECT_STORAGE_ENDPOINT`, `OBJECT_STORAGE_ACCESS_KEY`,
  `OBJECT_STORAGE_SECRET_KEY`, `OBJECT_STORAGE_BUCKET`,
  `OBJECT_STORAGE_REGION` and `OBJECT_STORAGE_FORCE_PATH_STYLE` variables, and
  the same adapter. No application code, schema or public contract changes, and
  nothing provider-specific is introduced.
- The staged decision is a build-and-provisioning decision, not a strategic one:
  the interface that would need to be re-evaluated is "a pullable S3-compatible
  image", not "S3".

### Security posture per environment

- **Staging**: the console is disabled, and the store publishes no port. It is
  reachable only on the internal Compose network, from the API, the media
  worker and the media-bucket provisioner. Credentials come from `.env.staging`
  as non-default secrets.
- **Local development**: the console stays enabled on port 9001 so the bucket
  can be inspected in a browser. Credentials are sourced from the developer's
  environment with a dev-only fallback that matches `.env.example`, so a
  developer who rotated the local credentials does not end up pointed at a store
  it cannot authenticate to.

### Portability is not tested against a second provider

The S3 contract is exercised against the store that is actually deployed. CI
still starts MinIO as a plain process built with `go install`, which sidesteps the
registry problem entirely; that is retained deliberately rather than churned
into a third configuration.

## Consequences

- **Positive**: a clean host can pull and start the platform, so provisioning and
  disaster recovery are actually possible. The application layer is unchanged,
  so the provider question no longer has to be revisited when MinIO's
  distribution changes again.
- **Trade-off**: two S3 implementations now exist in the repository (RustFS for
  compose, MinIO for CI). That is a real inconsistency, accepted because CI
  needs a process, not an image, and because unifying them would mean rewriting
  a passing e2e job for no operational gain. It is a candidate for consolidation
  if CI ever moves to containers.
- **Trade-off**: RustFS is a newer project than MinIO. Pinning the exact release
  and keeping the console disabled limit the exposure; upgrading is an explicit
  version bump, not a floating tag, so behaviour changes cannot arrive on their
  own.
- **Trade-off**: provider-specific features are unavailable, which is the
  intended consequence of staying behind plain S3. If a future requirement needs
  versioning, replication or lifecycle policies beyond the S3 baseline, that is
  the point at which the provider-neutral abstraction gets revisited rather than
  worked around with a RustFS-only call.

## Related

- `infrastructure/docker/RUNBOOK.md` — the deployed topology and the object-store
  configuration, including the public media path.
- `docs/PROJECT_STATUS.md` — the deployment slice and the remaining
  production-readiness boundary.
