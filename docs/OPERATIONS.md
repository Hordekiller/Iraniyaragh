# Operations, Reliability & Delivery

## Environments
Maintain independent:
- Development
- Staging
- Production

Production databases/credentials must never be reused for development.

## CI/CD baseline
Every pull request should run:
1. Lint
2. Type check
3. Unit/integration tests as available
4. Build
5. Migration/schema validation where applicable

Production deployments should be reproducible and Docker-based.

## Database migrations
- Schema changes use reviewed migrations.
- Avoid manual production schema edits.
- Destructive migrations require explicit data migration/backout consideration.

## Observability
Plan for:
- Structured application logs
- Request/correlation ID
- Error tracking
- Metrics
- Health/readiness endpoints
- Queue/worker monitoring
- Alerts for business-critical failures

Target stack can evolve toward OpenTelemetry + Prometheus/Grafana/Loki and/or Sentry.

## Background jobs
Use queues for work that should not slow synchronous user requests, such as:
- SMS/email/push
- Image processing
- Search indexing
- Invoice/report generation
- Integration retries

Jobs must be retry-safe and idempotent when side effects are possible.

## Feature flags
Use feature flags for risky or staged product launches where appropriate. Flags must not become a permanent substitute for deleting obsolete code.

## Infrastructure principle
Start cost-efficiently on Iranian VPS/cloud, but keep the application provider-portable:
- Containers
- Externalized configuration
- Independent backups
- S3-compatible storage
- No provider-specific business logic
