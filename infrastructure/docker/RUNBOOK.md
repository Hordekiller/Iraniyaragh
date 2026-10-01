# Deployment runbook (staging-shaped, single Docker host)

Scope: this is infrastructure only. It adds no product capability and no
business data. It exists so that a deploy is repeatable, reversible and
inspectable on a real host.

## What is here

| Path | Purpose |
| --- | --- |
| `infrastructure/docker/api.Dockerfile` | Compiled API + media worker + migration job |
| `infrastructure/docker/admin.Dockerfile` | Next.js standalone Admin |
| `infrastructure/docker/web.Dockerfile` | Static storefront, served by the Nginx image |
| `infrastructure/nginx/storefront.conf` | Public vhost; the only published port |
| `infrastructure/docker/compose.staging.yml` | Full stack, internal-only data tier. Pulls images; has no `build:` section |
| `infrastructure/docker/compose.staging.build.yml` | The `build:` sections, for CI. Never passed to a deployment host |
| `.github/workflows/publish-images.yml` | Builds the images for a commit and tags them with that commit's SHA |
| `infrastructure/docker/.env.staging.example` | Every variable, with the negative requirements spelled out |
| `scripts/deploy/deploy.sh` | Pull, back up, migrate, start, wait for readiness |
| `scripts/deploy/backup-postgres.sh` | Dumped automatically before every migration |
| `scripts/deploy/restore-postgres.sh` | Destructive restore, with an explicit confirmation flag |
| `scripts/deploy/rollback.sh` | Return to a named image tag |
| `scripts/deploy/logs.sh` | Tail every service |

`infrastructure/docker/docker-compose.yml` remains the local development stack.
It is not a deployment target: it publishes Postgres, Redis and the object store
on host ports and ships dev-only credentials.

## Images are built in CI, not on the host

A deployment host pulls. It never builds.

`publish-images.yml` builds the images for a commit on merge to `main` and tags
each one with the full 40-character commit SHA, so what a host runs is a
function of the commit alone. The host sets `IMAGE_TAG` to a SHA and runs
`docker compose pull`; `compose.staging.yml` has no `build:` section, so there
is no path by which a host can quietly build something of its own.

Four images are published:

| Image | Compose target | Runs |
| --- | --- | --- |
| `iranyaragh/api` | `api.Dockerfile` `runtime` | the API, the media worker and the media bucket |
| `iranyaragh/api-migrate` | `api.Dockerfile` `migrate` | the one-shot `migrate deploy` |
| `iranyaragh/admin` | `admin.Dockerfile` | the Admin |
| `iranyaragh/web` | `web.Dockerfile` | the storefront and Nginx |

`api` is published once and shared by three services, because those three are
the same Dockerfile target and therefore the same digest.

There are two API images because `prisma migrate deploy` needs the Prisma CLI,
which is a devDependency, and the runtime image is deliberately deployed with
production dependencies only. Publishing the CLI separately keeps it out of the
long-running container; putting it in the runtime image would undo that
hardening. `api-migrate` is large, since it reuses the full build stage, but it
is a one-shot container that exits.

The repository is public, so its packages are readable by anyone and a
deployment host pulls anonymously with no GHCR login. Nothing on the host is a
long-lived registry credential: the publishing token is minted per CI run.

Three consequences worth knowing:

- **The tag is the whole release identity.** `IMAGE_TAG` must be a full commit
  SHA. `compose.staging.yml` refuses to resolve without it, so a host that was
  never given an explicit release fails instead of running `latest`. A rollback
  names a commit, not a moving target.
- **A merge is not deployable until the publish run finishes.** The images
  appear a few minutes after the commit lands. Check the *Publish Images* run
  before deploying, and deploy the SHA it printed.
- **`NEXT_PUBLIC_*` is pinned at build time.** The Admin's API base URL and
  media origin are inlined into its client bundle and must be absolute, so they
  are set in the publish workflow rather than discovered at runtime. They must
  match the host's `.env.staging`. They default to the staging host's origin and
  can be overridden with the `STAGING_ORIGIN`, `STAGING_API_BASE_URL` and
  `STAGING_MEDIA_ORIGIN` repository variables once a real domain exists.

To build the images on a machine that has good registry access, for example to
test a Dockerfile change before it is merged:

```bash
IMAGE_TAG="$(git rev-parse HEAD)" \
  docker compose --env-file infrastructure/docker/.env.staging \
  -f infrastructure/docker/compose.staging.yml \
  -f infrastructure/docker/compose.staging.build.yml build
```

The object store is **RustFS**, pinned to `rustfs/rustfs:1.0.0`, in both compose
files. This replaced MinIO, whose upstream image now requires registry
authentication for anonymous pulls and so cannot be started from a clean
checkout. The swap is confined to the infrastructure layer: the API still talks
plain S3 over the same generic `OBJECT_STORAGE_*` variables through the same
provider-neutral adapter, and path-style addressing is still required. On
staging the console is disabled and no port is published; the dev compose
enables the console so the bucket can be inspected in a browser.

## First deploy

```bash
cd infrastructure/docker
cp .env.staging.example .env.staging
$EDITOR .env.staging          # fill in real values; see the blockers below
chmod +x ../../scripts/deploy/*.sh
../../scripts/deploy/deploy.sh
```

The deploy script refuses to continue if `.env.staging` is missing, backs up the
database before migrating, and fails if the API does not become healthy.

## Ordering guarantees

- **Migrate before traffic.** `migrate` runs `prisma migrate deploy` as a
  one-shot service; `api`, `media-worker` and therefore `admin`/`web` depend on
  it completing successfully. A half-migrated schema never serves traffic.
- **Only Nginx publishes a port.** Postgres, Redis, the object store, the API and
  the Admin have no `ports:`. They are reachable only on the internal network.
- **No default credentials anywhere.** Every secret comes from `.env.staging`.
- **The data tier survives restarts.** Named volumes, plus `restart: unless-stopped`
  on every long-running service, so a host reboot recovers without manual steps.
- **The media bucket is reconciled, not assumed.** `media-bucket` runs before
  the media worker and is idempotent.
- **The media worker is checked by state, not by an HTTP probe.** It consumes
  BullMQ queues and never binds a port, so the API image's liveness endpoint
  cannot apply to it. Its healthcheck is disabled and `deploy.sh` asserts the
  container is `running` instead, which still catches a crash loop.

## Negative requirements, enforced in code

These are not conventions to remember. Each one fails a build or a boot:

| Requirement | Where it is enforced |
| --- | --- |
| No fixture storefront in a deployed image | `web.Dockerfile` fails the build on `VITE_FIXTURE_CATALOG`/`VITE_FIXTURE_AUTH` |
| No fixture data in the shipped bundle | `web.Dockerfile` scans `dist/assets` for fixture markers after the build |
| No fixture staff client in a deployed Admin | `admin.Dockerfile` fails the build on `NEXT_PUBLIC_FIXTURE_AUTH` |
| No development access code | removed from the product in #372; no compose service re-enables it |
| Real payment gateway | API refuses to boot unless `PAYMENT_PROVIDER_MODE` is `live` with a merchant id and https callback, or `disabled`, which no-ops every call |
| Real SMS delivery | API refuses to boot without `SMS_IR_API_KEY` and all four template ids, unless `SMS_PROVIDER_MODE=disabled` |
| Real secrets | API refuses staging/production secrets shorter than 32 characters or containing a placeholder |
| https public origins | API rejects `http` for `STOREFRONT_ORIGIN` and `PUBLIC_MEDIA_ORIGIN` |
| Genuine health | `/api/v1/health/ready` checks Postgres and Redis; liveness alone is not used to accept traffic |

The deliberate consequence: **staging cannot be made to look successful with
fake providers.** There is no staging payment mode that returns success.

`PAYMENT_PROVIDER_MODE=disabled` and `SMS_PROVIDER_MODE=disabled` exist for
deploying before a provider account does, and they are the opposite of a stub:
the provider makes no network call, so it cannot mint a payment authority, a
settlement reference, a provider message id, or an OTP delivery record. Every
attempt gets an explicit refusal instead:

| Call | Result |
|---|---|
| `POST /api/v1/orders/:orderId/pay` | `503 PAYMENT_PROVIDER_DISABLED`, attempt recorded `FAILED` with reason `gateway_disabled` |
| Zarinpal callback verification | `503 PAYMENT_PROVIDER_DISABLED`, payment left `PENDING`, nothing persisted. If the payment came from a different provider or stored environment, it returns `400 INVALID_REQUEST` instead. |
| `POST /api/v1/auth/customer/otp/request` | `503 SMS_PROVIDER_DISABLED`, challenge invalidated so no undeliverable code stays live |

Both modes are rejected in `production`, where the real credentials are still
required. A payment left `PENDING` by a disabled gateway is deliberately not
marked failed: an authority issued while the gateway was live may already have
been settled, so it is left PENDING without a transition or an outbox event;
only payments that were issued by this gateway and have no stale environment
mismatch reach the `PAYMENT_PROVIDER_DISABLED` path.

A deploy with either provider disabled has **not** passed payment or SMS
acceptance, and the runbook's remaining steps do not substitute for it. Before
enabling real sales, set the mode to `live`/`smsir` with real credentials and
complete steps 4 and 5 of the acceptance list.

## Acceptance before calling a deploy done

Run against the real host, not localhost assumptions:

1. `curl -fsS https://<host>/api/v1/health/ready` returns a ready report.
2. The storefront loads over https and shows a real catalog. With no
   `VITE_SITE_*` values it shows "contact information is not published yet" and
   renders no `tel:` link — that is the correct unconfigured state, not a bug.
3. A staff operator signs in at `/admin` with a real password and TOTP, through
   the TTY bootstrap (`pnpm --filter @iranyaragh/api auth:bootstrap -- --confirm`).
   The bootstrap refuses to run without a TTY by design.
4. A product draft is created, an image uploaded, and the image becomes `READY`.
5. A real customer order is placed and reaches `PENDING_PAYMENT`. Do **not**
   assert a successful payment without a real Zarinpal callback. With
   `PAYMENT_PROVIDER_MODE=disabled` this step stops at the gateway refusal, which
   is the expected outcome rather than a skipped check.
6. `docker compose ... restart` and a host reboot are survivable: containers
   return on their own and volumes persist.
7. A backup is restored into a scratch database and the row counts are compared.
   An unverified backup is not a backup.
8. A published product image is fetched through its public URL
   (`https://<host>/media/<bucket>/<key>`), and it comes back with its real
   `Content-Type`. A `200` with `application/octet-stream` means the Nginx
   `/media/` rewrite or the bucket policy is wrong even though bytes are
   flowing, and it is worth checking explicitly.
9. An object backup is restored into a scratch bucket and one image is fetched
   from it. This proves the metadata in the manifest survives the round trip,
   not just the bytes.
8. A rollback to the previous image tag is exercised once before production.

## Blockers to clear before this can reach a real host

These are not solvable from the repository and are the reason no deploy has been
attempted yet:

- Server.ir VPS access: host, SSH user, and a domain with a certificate.
- A real Zarinpal merchant id and a callback URL reachable over https.
- Real SMS.ir API key and the four template ids.
- Verified business contact details, if any should be published at all. Until
  then the storefront publishes none, which is the intended behaviour.
- A real catalog, and a decision on who loads it. The demo seed is development
  data and is not a substitute.
- Confirmation of expected traffic, so `PRODUCT_MEDIA_*` limits are chosen
  deliberately rather than left to default.

## What this does not do

- No TLS termination. The container serves plain HTTP; a host-level proxy or a
  certificate mount is required, and the API's https requirement on public
  origins means this must be resolved before any real traffic.
- No multi-host, no replicas, no load balancer, no log shipping. This is a
  single-host shape on purpose.
- No automated seed of business data.
