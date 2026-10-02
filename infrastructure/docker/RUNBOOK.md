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
| `infrastructure/nginx/storefront.conf` | Public vhost: HTTP for ACME + redirect, HTTPS for everything else. The only published ports |
| `infrastructure/nginx/storefront-locations.conf` | The request routing, shared by both server blocks so they cannot drift |
| `infrastructure/docker/compose.staging.yml` | Full stack, internal-only data tier. Pulls images; has no `build:` section |
| `infrastructure/docker/compose.staging.build.yml` | The `build:` sections, for CI. Never passed to a deployment host |
| `.github/workflows/publish-images.yml` | Builds the images for a commit and tags them with that commit's SHA |
| `infrastructure/docker/.env.staging.example` | Every variable, with the negative requirements spelled out |
| `scripts/deploy/deploy.sh` | Pull, back up, migrate, start, wait for readiness, verify over HTTPS |
| `scripts/deploy/ensure-certificate.sh` | Obtain and renew the Let's Encrypt IP address certificate |
| `infrastructure/systemd/iranyaragh-certbot-renew.{service,timer}` | Unattended renewal, twice a day |
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

## TLS

Nginx terminates TLS in the `web` container, and ports 80 and 443 are both
published: 443 serves everything, 80 exists so the certificate can be renewed
without the site ever going dark.

The host is reached at a bare public IP, with no domain name, so the certificate
is a **Let's Encrypt IP address certificate**. Three facts about those shape
everything here:

- They are only issued under the `shortlived` profile and are valid for **160
  hours**, just over six days. Renewal is the mechanism on this host, not an
  optimisation: there is no long-lived certificate to fetch once and forget.
- Certbot's nginx plugin has no support for IP identifiers, so Certbot cannot
  install the certificate. Nginx reads `fullchain.pem` and `privkey.pem` from
  `/etc/nginx/tls`, bind-mounted from `TLS_DIR` on the host, and a `--deploy-hook`
  reloads Nginx after each renewal.
- Renewal uses `--webroot`, not `--standalone`. `--standalone` has to bind port
  80 itself, which means stopping the proxy; with a six-day certificate an
  unattended window where port 80 is closed is a window where renewal can fail.
  `--webroot` writes the challenge token into a directory Nginx already serves.

`ensure-certificate.sh` picks the method from the host's state rather than
requiring a flag: `--standalone` when nothing is listening on 80 (the first
deploy, before the stack exists), `--webroot` once it is up. It then re-registers
the certificate as webroot, so the bootstrap choice does not follow the
certificate into every later renewal.

### Getting a certificate

Certbot **5.4 or newer** is required (`--ip-address` arrived in 5.3, webroot
support for IP identifiers in 5.4). The Ubuntu package is older, so use the snap:

```bash
snap install certbot --classic
certbot --version   # must be 5.4 or newer
```

Test against the staging CA first. The staging CA issues untrusted certificates,
so this proves the plumbing without spending the production rate limit:

```bash
cd infrastructure/docker
../../scripts/deploy/ensure-certificate.sh --staging
```

Then the real thing, and confirm it chains to a public root. `--verify_return_error`
is what makes a failed chain a non-zero exit rather than a message to skim past,
and `-CAfile` is the system store, so this is a genuine trust check and not just
a TLS handshake:

```bash
../../scripts/deploy/ensure-certificate.sh
openssl s_client -connect 185.211.59.93:443 -servername 185.211.59.93 \
  -verify_return_error </dev/null 2>&1 | grep -E 'Verify return code|subject=|issuer='
```

`Verify return code: 0 (ok)` is the line that matters. The same check from the
host with `-connect 127.0.0.1:443` and the same `-servername` is what `deploy.sh`
relies on.

### Unattended renewal

Renewal is a systemd timer, not a deploy step: a certificate has to keep being
renewed whether or not anyone deploys.

```bash
install -m 0644 /opt/iranyaragh/infrastructure/systemd/iranyaragh-certbot-renew.service /etc/systemd/system/
install -m 0644 /opt/iranyaragh/infrastructure/systemd/iranyaragh-certbot-renew.timer  /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now iranyaragh-certbot-renew.timer
systemctl list-timers iranyaragh-certbot-renew.timer
```

Check the remaining lifetime at any time, and after any incident that touched
the timer:

```bash
openssl x509 -in "${TLS_DIR:-/srv/iranyaragh/tls}/fullchain.pem" -noout -dates
```

`deploy.sh` refuses to run without a certificate and prints this command when
there is none, so a missing certificate is a named prerequisite rather than a
`web` container stuck in a restart loop.

**Not production readiness.** A six-day certificate on a bare IP is a staging
arrangement: it works, it is publicly trusted, and it keeps itself renewed, but it
depends on that timer staying armed. Moving to a domain is the change that makes
the TLS story conventional.

## Host layout

Two roots, so that a `git pull` can never disturb runtime state:

| Path | Holds | Why separate |
| --- | --- | --- |
| `/opt/iranyaragh` | the git checkout, pulled and deployed from | replaced on deploy |
| `/srv/iranyaragh/tls` | `fullchain.pem`, `privkey.pem` | must outlive every deploy; a checkout wipe must not delete the certificate |
| `/srv/iranyaragh/acme-webroot` | Certbot's HTTP-01 challenge directory | same, and Certbot writes to it between deploys |

The deployment host needs the repository, because `deploy.sh` refuses to run
outside a checkout and refuses a commit that is not an ancestor of `origin/main`.
That check is the point: a host that could run an unmerged commit would make the
reviewed-deployment guarantee meaningless.

```bash
git clone https://github.com/Hordekiller/Iraniyaragh.git /opt/iranyaragh
```

`ENV_FILE` and `COMPOSE_FILE` in `ensure-certificate.sh` are derived from the
script's own location, so the certificate tooling and `deploy.sh` read the same
env file and compose file without either hardcoding a path.

## First deploy

```bash
cd /opt/iranyaragh/infrastructure/docker
cp .env.staging.example .env.staging
$EDITOR .env.staging          # fill in real values; see the blockers below
chmod +x ../../scripts/deploy/*.sh

# The certificate has to exist before the first `up`: the web container reads it
# at startup and refuses to start without it. See "TLS" above.
../../scripts/deploy/ensure-certificate.sh

../../scripts/deploy/deploy.sh
```

The deploy script refuses to continue if `.env.staging` is missing or there is no
certificate, backs up the database before migrating, fails if the API does not
become healthy, and verifies the public entry point over HTTPS against the real
origin name, so a certificate that is valid for something other than the
configured public origin fails the deploy.

## Provisioning the RBAC baseline and the first administrator

A fresh staging/production database has **no roles at all**. Migrations only grant
new permissions to an already-existing `system-admin`; they never create one. So
two separate operator steps are required after `migrate` and before anyone can sign
in, and `auth:bootstrap` refuses to start until the first of them has run.

These two paths are deliberately narrow and are the only supported way to reach
either environment. The development seed is *not* one of them, and its guard is
untouched.

| Step | Command | Creates | Allowed in |
| --- | --- | --- | --- |
| 1. RBAC baseline | `rbac:baseline -- --apply` | canonical `Role`/`Permission`/`RolePermission` + one audit row | staging, production |
| 2. First admin | `auth:bootstrap -- --confirm` | one staff user with password, TOTP secret and 10 recovery codes | any, in a TTY |

### 1. Apply and verify the canonical RBAC baseline

Run it in a one-shot container that has the release image, so the exact deployed
artifact performs the write:

```bash
cd /opt/iranyaragh/infrastructure/docker
docker compose --env-file .env.staging -f compose.staging.yml run --rm --no-deps \
  api node prisma/apply-rbac-baseline.mjs --apply
```

It requires `ALLOW_RBAC_BASELINE=true` and `NODE_ENV=staging` (or `production`).
Add it to `.env.staging` so the authorization is recorded with the deployment:

```dotenv
ALLOW_RBAC_BASELINE=true
```

In `production` it also requires a second, deliberate acknowledgement:

```bash
RBAC_BASELINE_CONFIRM_PRODUCTION=apply-canonical-rbac-baseline
```

Then verify with the read-only gate, which performs no writes and exits non-zero
on any drift:

```bash
docker compose --env-file .env.staging -f compose.staging.yml run --rm --no-deps \
  api node prisma/apply-rbac-baseline.mjs --check
```

Both commands print only the target database name and counts. Neither ever prints
`DATABASE_URL` or any secret.

Re-running `--apply` is safe at any time. It is additive and idempotent: it creates
what is missing, reactivates a deactivated canonical permission, restores a
revoked canonical grant, and repairs a drifted name or description. It never
deletes a grant an operator added on purpose — a non-canonical grant is reported by
`--check` and left alone, because that is an operator decision rather than drift.

### 2. Provision the first administrator

```bash
cd /opt/iranyaragh/apps/api
pnpm --filter @iranyaragh/api auth:bootstrap -- --confirm
```

This one is genuinely interactive. It refuses to run without a TTY by design, it
reads the password without echo, and it will not accept a password outside 15–128
characters. Before it prompts for anything it checks that the `system-admin` role
exists and prints the exact `--apply` command above if it does not, so you are
never asked for a secret only to fail later.

It then generates a TOTP secret, prints it and an `otpauth://` URI **once**, and
waits for a current code from your authenticator app before it commits. Enter the
secret into Google Authenticator (or any TOTP app) *before* typing the code — a
code is only useful once the secret is enrolled, and codes rotate every 30
seconds. The 10 recovery codes are printed once at the end and are not
recoverable.

### Demo data on staging (optional, separate)

Staging may want catalog rows to look like a shop. That is a different, explicitly
staged operation and never part of the RBAC baseline:

```bash
cd /opt/iranyaragh/infrastructure/docker
docker compose --env-file .env.staging -f compose.staging.yml run --rm --no-deps \
  api node prisma/seed-demo-staging.mjs --confirm
```

It requires `ALLOW_DEMO_STAGING_DATA=true` and `NODE_ENV=staging`, and is rejected
in production, development and test, so demo rows cannot reach CI or a real
environment. It creates catalog, pricing, warehouse, location and opening
inventory only. It deliberately creates **no** order, payment, payment confirmation
or SMS delivery success — see the provider note below for why a fabricated success
row is worse than no row at all.

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
- **RBAC before sign-in.** A fresh database has no roles. The operator applies the
  canonical baseline (`rbac:baseline -- --apply`) and `auth:bootstrap` refuses to
  start until `system-admin` exists, so the first administrator is never stranded
  by a half-provisioned database. See "Provisioning the RBAC baseline and the
  first administrator" above.
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
| RBAC baseline only on staging/production | `rbac-baseline-policy.mjs` rejects any other `NODE_ENV`, requires `ALLOW_RBAC_BASELINE=true`, adds a second confirmation for production, and refuses a `_test`/`_dev` database |
| No user in the RBAC path | `prisma/rbac-baseline.mjs` writes only `Role`/`Permission`/`RolePermission`/`AuditLog`; asserted by `rbac-baseline.test.mjs` and `bootstrap-artifact-scan.spec.ts` |
| No demo row in the RBAC path | same assertions reject every demo identifier in the baseline path; demo data exists only behind `NODE_ENV=staging` |
| No fabricated payment/SMS success | demo path stops at catalog/inventory and touches no order, payment or notification model |

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
complete steps 5 and 6 of the acceptance list.

## Acceptance before calling a deploy done

Run against the real host, not localhost assumptions:

1. `curl -fsS https://<host>/api/v1/health/ready` returns a ready report.
2. The storefront loads over https and shows a real catalog. With no
   `VITE_SITE_*` values it shows "contact information is not published yet" and
   renders no `tel:` link — that is the correct unconfigured state, not a bug.
3. The canonical RBAC baseline is applied and then verified with the read-only
   gate — `rbac:baseline -- --apply`, then `rbac:baseline -- --check`. A fresh
   database must be able to reach "role `system-admin`, all permissions granted"
   before any sign-in is attempted.
4. A staff operator signs in at `/admin` with a real password and TOTP, through
   the TTY bootstrap (`pnpm --filter @iranyaragh/api auth:bootstrap -- --confirm`).
   The bootstrap refuses to run without a TTY by design.
5. A product draft is created, an image uploaded, and the image becomes `READY`.
6. A real customer order is placed and reaches `PENDING_PAYMENT`. Do **not**
   assert a successful payment without a real Zarinpal callback. With
   `PAYMENT_PROVIDER_MODE=disabled` this step stops at the gateway refusal, which
   is the expected outcome rather than a skipped check.
7. `docker compose ... restart` and a host reboot are survivable: containers
   return on their own and volumes persist.
8. A backup is restored into a scratch database and the row counts are compared.
   An unverified backup is not a backup.
9. The certificate is checked from outside, not just from the host: a browser
   or `curl` to the public origin shows no warning, and
   `curl -sS https://<host>/` does not redirect to itself. Then the renewal timer
   is confirmed armed and a forced renewal succeeds:
   `ensure-certificate.sh --force`.
10. A published product image is fetched through its public URL
    (`https://<host>/media/<bucket>/<key>`), and it comes back with its real
    `Content-Type`. A `200` with `application/octet-stream` means the Nginx
    `/media/` rewrite or the bucket policy is wrong even though bytes are
    flowing, and it is worth checking explicitly.
11. An object backup is restored into a scratch bucket and one image is fetched
    from it. This proves the metadata in the manifest survives the round trip,
    not just the bytes.
12. A rollback to the previous image tag is exercised once before production.

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

- No domain name yet, so the certificate is a short-lived IP address
  certificate on a six-day renewal cycle rather than a 90-day domain one. It is
  publicly trusted and it renews itself, but it is a staging arrangement: see
  "TLS" above.
- No multi-host, no replicas, no load balancer, no log shipping. This is a
  single-host shape on purpose.
- No automated seed of business data.
