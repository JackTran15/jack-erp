# TKT-020 Redis caching layer setup

## Epic

[EPIC-001 Foundation and Monorepo](../epics/EPIC-001-foundation-and-monorepo.md)

## Summary

Introduce Redis as shared low-latency cache for read acceleration and idempotency helper keys.

## Deliverables

- Redis deployment and connection management.
- Caching policy for high-read endpoints and branch scope lookups.
- Key naming conventions and TTL strategy.
- Invalidation hooks from write-side commits/domain events.
- Session-key design for JWT validation and revocation checks.

## Acceptance Criteria

- Cache hit ratio and latency metrics are monitored.
- Stale-cache behavior is bounded by TTL and invalidation design.
- Critical write paths remain correct with cache bypass/failure.
- JWT session revocation is enforced using Redis session state.

## Dependencies

- [TKT-003 API app bootstrap](./TKT-003-api-app-bootstrap.md)
