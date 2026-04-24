# TKT-019 Redpanda event bus setup

## Epic

[EPIC-001 Foundation and Monorepo](../epics/EPIC-001-foundation-and-monorepo.md)

## Summary

Introduce Redpanda as the distributed message broker (Kafka-compatible) for ERP domain events.

## Deliverables

- Redpanda cluster configuration for `dev` and `staging`.
- Topic setup for core events:
  - `erp.sale.posted`
  - `erp.stock.movement.posted`
  - `erp.journal.posted`
  - `erp.customer.merged`
- Producer/consumer baseline package and conventions.
- Retry and dead-letter policy design.

## Acceptance Criteria

- API publishes events to Redpanda on committed transactions.
- Consumer lag and failure metrics are visible in monitoring.
- Message handling is idempotent under retry and replay scenarios.

## Dependencies

- [TKT-003 API app bootstrap](./TKT-003-api-app-bootstrap.md)
- [TKT-021 Shared KafkaJS client package](./TKT-021-shared-kafkajs-client-package.md)
