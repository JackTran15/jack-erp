# Deployment and Operations

## Environment Strategy

- `dev`: shared development environment.
- `staging`: production-like environment for integration and UAT.
- `prod`: live environment with controlled release policy.

## Deployment Architecture (V1)

- NestJS API deployed as containerized service.
- React back office and POS frontend deployed as static assets behind CDN/web server.
- PostgreSQL managed instance with automated backups.
- Redpanda cluster deployed for Kafka-compatible distributed messaging.
- Redis deployed for low-latency caching and idempotency helpers.
- Realtime layer uses `socket.io` + Redis adapter for multi-instance notification delivery.
- Source code managed in a `pnpm` workspace monorepo.

## Realtime Load Balancing Policy

- Enable sticky-session at ingress/load balancer when polling transport is enabled.
- Preferred production mode is WebSocket transport with Redis adapter.
- Keep sticky-session enabled in production for safer connection affinity during reconnect churn.

## CI/CD Pipeline

1. Build and test.
2. Static checks and security scans.
3. Container/image build and tag.
4. Deploy to staging.
5. Run smoke and regression tests.
6. Manual approval gate for production.
7. Production deployment with rollback readiness.

## Monorepo Build Pipeline (pnpm)

Recommended CI command order:

1. `pnpm install --frozen-lockfile`
2. `pnpm -r lint`
3. `pnpm -r test`
4. `pnpm -r build`
5. Build and publish deployable artifacts per app (`api`, `backoffice-web`, `pos-web`)

Monorepo checks:

- Verify workspace dependency protocol (`workspace:*`) for internal packages.
- Block duplicate domain contract definitions outside `packages/shared-interfaces`.

## Configuration and Secrets

- Use environment variables for runtime config.
- Store secrets in dedicated secrets manager.
- Rotate credentials on schedule and incident response.

## Database Operations

- Daily backups with point-in-time recovery capability.
- Scheduled restore drills.
- Migration execution as part of release process with rollback plan.

## Monitoring and Alerting

Monitor:

- API latency and error rates
- DB health and slow query trends
- Redpanda broker health, partition availability, consumer lag, and DLQ growth
- Redis memory usage, eviction rate, keyspace hit ratio, and command latency
- Job queue/import failures
- POS checkout failure rate
- Reconciliation mismatch count

Alert severity:

- P1: checkout down, posting failure, DB unavailable
- P2: degraded performance, repeated import failure
- P3: non-critical report delays

## Incident Management

- Incident runbook with owner roles.
- Time-bound communication updates.
- Postmortem required for P1 and major P2 incidents.

## Security Operations

- Dependency vulnerability scanning.
- Access review and role recertification.
- Audit log review for high-risk actions.

## Acceptance Criteria

- Automated deployment pipeline is operational for staging and production.
- Backup and restore process is tested.
- Monitoring and alerts cover all critical ERP workflows.
