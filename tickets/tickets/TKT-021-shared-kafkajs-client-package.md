# TKT-021 Shared KafkaJS client package

## Epic

[EPIC-001 Foundation and Monorepo](../epics/EPIC-001-foundation-and-monorepo.md)

## Summary

Create `@erp/shared-kafka-client` to provide standardized KafkaJS producer and consumer clients with separate configurations.

## Deliverables

- Package scaffold under `packages/shared-kafka-client`.
- Shared Kafka bootstrap/client factory for Redpanda brokers.
- Producer factory with producer-focused defaults (acks/retries/batching/compression).
- Consumer factory with consumer-focused defaults (`groupId`, session, heartbeat, fetch/concurrency, commit policy).
- Module-level override mechanism so producer/consumer configs can differ by use case.
- Shared retry and dead-letter helper conventions.

## Acceptance Criteria

- API modules can import producer and consumer clients from one package.
- Producer and consumer configs are isolated and independently configurable.
- Baseline integration test verifies publish and consume using different config profiles.

## Dependencies

- [TKT-003 API app bootstrap](./TKT-003-api-app-bootstrap.md)
